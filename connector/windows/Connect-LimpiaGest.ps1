[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$CompanyId,
  [string]$PairingCode,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
$PairUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorPair"
$DefaultHeartbeatUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorHeartbeat"
$DefaultClaimUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorClaim"
$DefaultResultUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorResult"
$AeatWsdl = "https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl"
$AllowedAeatEndpoint = "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
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
  $normalizedTaxId = ($ExpectedTaxId -replace "[^a-zA-Z0-9]", "").ToUpperInvariant()
  $candidates = @(
    Get-ChildItem Cert:\CurrentUser\My -ErrorAction SilentlyContinue
    Get-ChildItem Cert:\LocalMachine\My -ErrorAction SilentlyContinue
  ) | Where-Object {
    $_.HasPrivateKey -and
    $_.NotBefore -le $now -and
    $_.NotAfter -gt $now -and
    (($_.Subject -replace "[^a-zA-Z0-9]", "").ToUpperInvariant()) -match [regex]::Escape($normalizedTaxId)
  } | Sort-Object NotAfter -Descending
  if ($candidates.Count -eq 0) {
    throw "No encontramos un certificado vigente con clave privada para el NIF $normalizedTaxId."
  }
  return $candidates[0]
}

function Test-AeatAccess($Certificate) {
  $handler = [Net.Http.HttpClientHandler]::new()
  [void]$handler.ClientCertificates.Add($Certificate)
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
    claimUrl = if ($saved.claimUrl) { $saved.claimUrl } else { $DefaultClaimUrl }
    resultUrl = if ($saved.resultUrl) { $saved.resultUrl } else { $DefaultResultUrl }
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
    claimUrl = if ($paired.claimUrl) { $paired.claimUrl } else { $DefaultClaimUrl }
    resultUrl = if ($paired.resultUrl) { $paired.resultUrl } else { $DefaultResultUrl }
    connectorToken = $paired.connectorToken
  }
  @{
    companyId = $credential.companyId
    expectedTaxId = $credential.expectedTaxId
    heartbeatUrl = $credential.heartbeatUrl
    claimUrl = $credential.claimUrl
    resultUrl = $credential.resultUrl
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

function Get-XmlValue($Xml, [string]$LocalName) {
  $node = $Xml.SelectSingleNode("//*[local-name()='$LocalName']")
  if ($node) { return [string]$node.InnerText }
  return ""
}

function Send-AeatJob($Job, $Certificate) {
  if ([string]$Job.endpoint -ne $AllowedAeatEndpoint) {
    return @{ transportOk = $false; httpStatus = 0; message = "Destino AEAT no permitido por el conector de pruebas." }
  }
  $schemaValidator = Join-Path $PSScriptRoot "Test-OfficialSoapSchema.ps1"
  try {
    & $schemaValidator -SoapXml ([string]$Job.soapXml) | Out-Null
  } catch {
    return @{ transportOk = $false; httpStatus = 0; permanentFailure = $true; message = "El registro no cumple el esquema oficial de AEAT: $($_.Exception.Message)" }
  }
  $handler = [Net.Http.HttpClientHandler]::new()
  [void]$handler.ClientCertificates.Add($Certificate)
  $handler.CheckCertificateRevocationList = $true
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(60)
  try {
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, [string]$Job.endpoint)
    $request.Content = [Net.Http.StringContent]::new([string]$Job.soapXml, [Text.Encoding]::UTF8, "text/xml")
    [void]$request.Headers.TryAddWithoutValidation("SOAPAction", '""')
    $httpResponse = $client.SendAsync($request).GetAwaiter().GetResult()
    $responseXml = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    if (-not $httpResponse.IsSuccessStatusCode) {
      return @{
        transportOk = $false
        httpStatus = [int]$httpResponse.StatusCode
        message = "AEAT respondió HTTP $([int]$httpResponse.StatusCode): $($responseXml.Substring(0, [Math]::Min(1000, $responseXml.Length)))"
      }
    }
    [xml]$parsed = $responseXml
    $fault = Get-XmlValue $parsed "faultstring"
    if ($fault) {
      return @{ transportOk = $false; httpStatus = 200; message = $fault }
    }
    return @{
      transportOk = $true
      httpStatus = 200
      csv = Get-XmlValue $parsed "CSV"
      shipmentState = Get-XmlValue $parsed "EstadoEnvio"
      recordState = Get-XmlValue $parsed "EstadoRegistro"
      code = Get-XmlValue $parsed "CodigoErrorRegistro"
      message = Get-XmlValue $parsed "DescripcionErrorRegistro"
      waitSeconds = Get-XmlValue $parsed "TiempoEsperaEnvio"
    }
  } catch {
    return @{ transportOk = $false; httpStatus = 0; message = $_.Exception.Message }
  } finally {
    if ($request) { $request.Dispose() }
    $client.Dispose()
    $handler.Dispose()
  }
}

do {
  $heartbeatResponse = Invoke-JsonPost $credential.heartbeatUrl $heartbeat $credential.connectorToken
  Write-Host "Conectado a LimpiaGest · certificado válido hasta $($certificate.NotAfter.ToString('dd/MM/yyyy'))" -ForegroundColor Green
  $claimUrl = if ($credential.claimUrl) { $credential.claimUrl } elseif ($heartbeatResponse.claimUrl) { $heartbeatResponse.claimUrl } else { $DefaultClaimUrl }
  $resultUrl = if ($credential.resultUrl) { $credential.resultUrl } elseif ($heartbeatResponse.resultUrl) { $heartbeatResponse.resultUrl } else { $DefaultResultUrl }
  $claim = Invoke-JsonPost $claimUrl @{ companyId = $credential.companyId } $credential.connectorToken
  if ($claim.job) {
    Write-Host "Enviando registro $($claim.job.submissionId) al entorno AEAT de pruebas..." -ForegroundColor Cyan
    $aeatResult = Send-AeatJob $claim.job $certificate
    $aeatResult.companyId = $credential.companyId
    $aeatResult.submissionId = $claim.job.submissionId
    $recorded = Invoke-JsonPost $resultUrl $aeatResult $credential.connectorToken
    Write-Host "Resultado: $($recorded.status)" -ForegroundColor Green
  }
  if ($Once) { break }
  Start-Sleep -Seconds 30
} while ($true)
