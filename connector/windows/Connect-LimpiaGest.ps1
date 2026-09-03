[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$CompanyId,
  [string]$PairingCode,
  [switch]$ForcePair,
  [switch]$PairOnly,
  [switch]$Once
)

$ErrorActionPreference = "Stop"
if ($CompanyId -notmatch '^[a-zA-Z0-9_-]{1,128}$') { throw "Identificador de empresa no valido." }
. (Join-Path $PSScriptRoot "ConnectorProtocol.ps1")
Add-Type -AssemblyName System.Net.Http
$PairUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorPair"
$DefaultHeartbeatUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorHeartbeat"
$DefaultClaimUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorClaim"
$DefaultResultUrl = "https://europe-west1-ryb-limpiezas-app.cloudfunctions.net/localConnectorResult"
$AeatWsdl = "https://prewww2.aeat.es/static_files/common/internet/dep/aplicaciones/es/aeat/tikeV1.0/cont/ws/SistemaFacturacion.wsdl"
$AllowedAeatEndpoint = "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP"
$DataDirectory = Join-Path $env:LOCALAPPDATA "LimpiaGest\ConectorVeriFactu"
$CredentialPath = Join-Path $DataDirectory ((($CompanyId -replace "[^a-zA-Z0-9_-]", "_") + ".json"))
$JournalPath = Join-Path $DataDirectory ($CompanyId + ".pending-result.dpapi")
if ($ForcePair -and (Test-Path -LiteralPath $JournalPath)) {
  throw "Hay un resultado protegido pendiente. Resuelve la incidencia antes de cambiar la vinculacion."
}

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
  if ($Uri -cnotin @($PairUrl, $DefaultHeartbeatUrl, $DefaultClaimUrl, $DefaultResultUrl)) { throw "Destino de plataforma no permitido." }
  $headers = @{}
  if ($Token) { $headers.Authorization = "Bearer $Token" }
  return Invoke-RestMethod -Method Post -Uri $Uri -Headers $headers -MaximumRedirection 0 -TimeoutSec 30 -ContentType "application/json; charset=utf-8" -Body ([Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Depth 8 -Compress)))
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
  $handler.AllowAutoRedirect = $false
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
if (-not $ForcePair -and (Test-Path -LiteralPath $CredentialPath)) {
  $saved = Get-Content -LiteralPath $CredentialPath -Raw | ConvertFrom-Json
  if ($saved.companyId -ne $CompanyId) { throw "La vinculacion guardada pertenece a otra empresa." }
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
    $PairingCode = Read-Host "Escribe el codigo que muestra LimpiaGest"
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

function Send-AeatJob($Job, $Certificate) {
  try { Assert-ConnectorJob $Job $Certificate $credential.expectedTaxId }
  catch { return @{ httpStatus = 0; responseXml = ''; failureKind = 'payload' } }
  try { & (Join-Path $PSScriptRoot "Test-OfficialSoapSchema.ps1") -SoapXml ([string]$Job.soapXml) | Out-Null }
  catch { return @{ httpStatus = 0; responseXml = ''; failureKind = 'schema' } }
  $handler = [Net.Http.HttpClientHandler]::new()
  [void]$handler.ClientCertificates.Add($Certificate)
  $handler.CheckCertificateRevocationList = $true
  $handler.AllowAutoRedirect = $false
  $handler.SslProtocols = [Security.Authentication.SslProtocols]::Tls12
  $client = [Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(60)
  $client.MaxResponseContentBufferSize = 524288
  $request = $null
  $httpResponse = $null
  try {
    $request = [Net.Http.HttpRequestMessage]::new([Net.Http.HttpMethod]::Post, [string]$Job.endpoint)
    $request.Content = [Net.Http.StringContent]::new([string]$Job.soapXml, [Text.Encoding]::UTF8, "text/xml")
    [void]$request.Headers.TryAddWithoutValidation("SOAPAction", '""')
    $httpResponse = $client.SendAsync($request).GetAwaiter().GetResult()
    $responseXml = $httpResponse.Content.ReadAsStringAsync().GetAwaiter().GetResult()
    return @{ httpStatus = [int]$httpResponse.StatusCode; responseXml = $responseXml; failureKind = '' }
  } catch {
    return @{ httpStatus = 0; responseXml = ''; failureKind = 'network' }
  } finally {
    if ($httpResponse) { $httpResponse.Dispose() }
    if ($request) { $request.Dispose() }
    $client.Dispose()
    $handler.Dispose()
  }
}

$mutex = [Threading.Mutex]::new($false, ("Local\LimpiaGestConnector_" + $CompanyId))
$ownsMutex = $false
try {
  try { $ownsMutex = $mutex.WaitOne(0) } catch [Threading.AbandonedMutexException] { $ownsMutex = $true }
  if (-not $ownsMutex) {
    Write-Host "El conector de esta empresa ya esta activo. No es necesario abrir otro."
    return
  }
  do {
    try {
      # Recover the protected receipt first, even if the certificate has expired
      # since sending. A pending receipt must never lead to a second network send.
      if ($PairOnly -or -not (Test-Path -LiteralPath $JournalPath)) {
        $certificate = Find-CompanyCertificate $credential.expectedTaxId
        $heartbeat = @{
          companyId = $credential.companyId; protocolVersion = 2; capabilities = @('query_reconciliation_v1'); connectorName = $env:COMPUTERNAME;
          certificateTaxId = $credential.expectedTaxId; certificateSubject = $certificate.Subject;
          certificateThumbprint = $certificate.Thumbprint; certificateValidFrom = $certificate.NotBefore.ToUniversalTime().ToString("o");
          certificateValidTo = $certificate.NotAfter.ToUniversalTime().ToString("o");
          daysRemaining = [Math]::Floor(($certificate.NotAfter - (Get-Date)).TotalDays);
          aeatTestReachable = $false
        }
        if ($PairOnly) { $heartbeat.aeatTestReachable = Test-AeatAccess $certificate }
        $heartbeatResponse = Invoke-JsonPost $DefaultHeartbeatUrl $heartbeat $credential.connectorToken
        Write-Host "Conector Windows conectado. Produccion bloqueada." -ForegroundColor Cyan
      }
      if ($PairOnly) {
        Write-Host "Emparejamiento completado. No se ha enviado ningun registro a la AEAT." -ForegroundColor Green
        break
      }
      $outcome = Invoke-ConnectorDelivery -CompanyId $CompanyId -ReadJournal { Read-ConnectorJournal $JournalPath } -WriteJournal {
        param($value) Write-ConnectorJournal $JournalPath $value
      } -ClearJournal {
        # This one encrypted receipt is removed only after an explicit server acknowledgement.
        [IO.File]::Delete($JournalPath)
      } -Claim {
        Invoke-JsonPost $DefaultClaimUrl @{ companyId = $CompanyId; protocolVersion = 2 } $credential.connectorToken
      } -Send {
        param($job) Send-AeatJob $job $certificate
      } -Report {
        param($receipt) Invoke-JsonPost $DefaultResultUrl $receipt $credential.connectorToken
      }
      if ($outcome.retained) {
        Write-Warning $outcome.message
        break
      }
      $labels = @{ accepted = 'Aceptado en pruebas'; accepted_with_errors = 'Aceptado con errores';
        rejected = 'Rechazado por AEAT'; retry_pending = 'Reintento pendiente'; needs_review = 'Necesita revision'; waiting = 'Esperando registros' }
      Write-Host ($labels[[string]$outcome.status])
      if ($outcome.message) { Write-Host $outcome.message }
    } catch {
      Write-Warning "No se pudo completar la conexion. El resultado pendiente, si existe, sigue protegido. Se reintentara sin emitir otra factura."
      if ($PairOnly) { throw }
    }
    if ($Once) { break }
    Start-Sleep -Seconds 30
  } while ($true)
} finally {
  if ($ownsMutex) { $mutex.ReleaseMutex() }
  $mutex.Dispose()
}
