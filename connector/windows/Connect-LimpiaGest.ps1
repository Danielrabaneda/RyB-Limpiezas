[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$CompanyId,
  [string]$PairingCode,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$PairUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorPair"
$DefaultHeartbeatUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorHeartbeat"
$AeatWsdl = "https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl"
$DataDirectory = Join-Path $env:LOCALAPPDATA "LimpiaGest\ConectorVeriFactu"
$CredentialPath = Join-Path $DataDirectory ((($CompanyId -replace "[^a-zA-Z0-9_-]", "_") + ".json"))

function Protect-Text([string]$PlainText) {
  Add-Type -AssemblyName System.Security
  $bytes = [Text.Encoding]::UTF8.GetBytes($PlainText)
  $protected = [Security.Cryptography.ProtectedData]::Protect(
    $bytes,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [Convert]::ToBase64String($protected)
}

function Unprotect-Text([string]$ProtectedText) {
  Add-Type -AssemblyName System.Security
  $bytes = [Convert]::FromBase64String($ProtectedText)
  $plain = [Security.Cryptography.ProtectedData]::Unprotect(
    $bytes,
    $null,
    [Security.Cryptography.DataProtectionScope]::CurrentUser
  )
  return [Text.Encoding]::UTF8.GetString($plain)
}

function Invoke-JsonPost([string]$Uri, [hashtable]$Body, [string]$Token = "") {
  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  return Invoke-RestMethod -Method Post -Uri $Uri -Headers $headers -ContentType "application/json" -Body ($Body | ConvertTo-Json -Depth 5 -Compress)
}

function Find-CompanyCertificate([string]$ExpectedTaxId) {
  $now = Get-Date
  $candidates = @(
    Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue
    Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue
  ) | Where-Object {
    $_.HasPrivateKey -and
    $_.NotBefore -le $now -and
    $_.NotAfter -gt $now -and
    $_.Subject -match [regex]::Escape($ExpectedTaxId)
  } | Sort-Object NotAfter -Descending
  if ($candidates.Count -eq 0) {
    throw "No encontramos un certificado vigente con clave privada para el NIF $ExpectedTaxId."
  }
  return $candidates[0]
}

function Test-AeatAccess($Certificate) {
  $handler = [Net.Http.HttpClientHandler]::new()
  $handler.ClientCertificates.Add($Certificate)
  $handler.CheckCertificateRevocationList = $true
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(30)
  try {
    $result = $client.GetAsync($AeatWsdl).GetAwaiter().GetResult()
    return $result.IsSuccessStatusCode
  } catch {
    return $false
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

New-Item -ItemType Directory -Path $DataDirectory -Force | Out-Null
$credential = $null
if (Test-Path -LiteralPath $CredentialPath) {
  $saved = Get-Content -LiteralPath $CredentialPath -Raw | ConvertFrom-Json
  $credential = [pscustomobject]@{
    companyId = $saved.companyId
    expectedTaxId = $saved.expectedTaxId
    heartbeatUrl = $saved.heartbeatUrl
    connectorToken = Unprotect-Text $saved.protectedToken
  }
}

if (-not $credential) {
  if (-not $PairingCode) {
    $PairingCode = Read-Host "Escribe el código que muestra LimpiaGest"
  }
  Write-Host "Conectando este ordenador con LimpiaGest..." -ForegroundColor Cyan
  $paired = Invoke-JsonPost $PairUrl @{
    companyId = $CompanyId
    pairingCode = $PairingCode.Trim().ToUpperInvariant()
  }
  $credential = [pscustomobject]@{
    companyId = $paired.companyId
    expectedTaxId = $paired.expectedTaxId
    heartbeatUrl = if ($paired.heartbeatUrl) { $paired.heartbeatUrl } else { $DefaultHeartbeatUrl }
    connectorToken = $paired.connectorToken
  }
  @{
    companyId = $credential.companyId
    expectedTaxId = $credential.expectedTaxId
    heartbeatUrl = $credential.heartbeatUrl
    protectedToken = Protect-Text $credential.connectorToken
  } | ConvertTo-Json | Set-Content -LiteralPath $CredentialPath -Encoding UTF8
}

$certificate = Find-CompanyCertificate $credential.expectedTaxId
$aeatReachable = Test-AeatAccess $certificate
$heartbeat = @{
  companyId = $credential.companyId
  connectorName = $env:COMPUTERNAME
  certificateTaxId = $credential.expectedTaxId
  certificateSubject = $certificate.Subject
  certificateThumbprint = $certificate.Thumbprint
  certificateValidTo = $certificate.NotAfter.ToString("o")
  daysRemaining = [Math]::Floor(($certificate.NotAfter - (Get-Date)).TotalDays)
  aeatTestReachable = $aeatReachable
}

do {
  Invoke-JsonPost $credential.heartbeatUrl $heartbeat $credential.connectorToken | Out-Null
  Write-Host "Conectado a LimpiaGest · certificado válido hasta $($certificate.NotAfter.ToString('dd/MM/yyyy'))" -ForegroundColor Green
  if ($Once) { break }
  Start-Sleep -Seconds 60
} while ($true)
