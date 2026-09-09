# Protocol v2 helpers. Loading this file never accesses certificates or the network.
function Get-ConnectorXmlHash([string]$Xml) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try { return ([BitConverter]::ToString($sha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Xml)))).Replace("-", "").ToLowerInvariant() }
  finally { $sha.Dispose() }
}

function Assert-ConnectorJob($Job, $Certificate, [string]$ExpectedTaxId) {
  if ($Job.protocolVersion -ne 2 -or $Job.environment -ne "test" -or $Job.productionEnabled -ne $false) { throw "protocol" }
  if ($Job.operation -and $Job.operation -notin @('submit', 'query')) { throw "operation" }
  if ($Job.endpoint -cne "https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP") { throw "endpoint" }
  if ([string]$Job.attemptToken -notmatch '^[a-zA-Z0-9-]{1,80}$' -or [int]$Job.attemptNumber -lt 1 -or [int]$Job.attemptNumber -gt 8) { throw "attempt" }
  if (([DateTimeOffset]::Parse([string]$Job.leaseExpiresAt) - [DateTimeOffset]::UtcNow).TotalSeconds -lt 65) { throw "lease" }
  if (-not $Job.soapXml -or (Get-ConnectorXmlHash ([string]$Job.soapXml)) -cne [string]$Job.soapSha256) { throw "payload" }
  $expected = ($ExpectedTaxId -replace '[^a-zA-Z0-9]', '').ToUpperInvariant()
  if (-not $expected -or ([string]$Job.expectedTaxId).ToUpperInvariant() -ne $expected) { throw "certificate" }
  if (-not $Certificate.HasPrivateKey -or $Certificate.NotBefore -gt (Get-Date) -or $Certificate.NotAfter -le (Get-Date)) { throw "certificate" }
}

function Read-ConnectorJournal([string]$Path) {
  if (-not [IO.File]::Exists($Path)) { return $null }
  Add-Type -AssemblyName System.Security
  $bytes = [Convert]::FromBase64String([IO.File]::ReadAllText($Path))
  $plain = [Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  return ([Text.Encoding]::UTF8.GetString($plain) | ConvertFrom-Json)
}

function Write-ConnectorJournal([string]$Path, $Value) {
  Add-Type -AssemblyName System.Security
  $plain = [Text.Encoding]::UTF8.GetBytes(($Value | ConvertTo-Json -Depth 8 -Compress))
  $encrypted = [Security.Cryptography.ProtectedData]::Protect($plain, $null, [Security.Cryptography.DataProtectionScope]::CurrentUser)
  $temporary = "$Path.$([Guid]::NewGuid().ToString('N')).tmp"
  try {
    # Flush to disk before the network send / acknowledgement. Atomic replacement
    # preserves the previous journal if writing the new receipt fails.
    $stream = [IO.File]::Open($temporary, [IO.FileMode]::CreateNew, [IO.FileAccess]::Write, [IO.FileShare]::None)
    try {
      $bytes = [Text.Encoding]::ASCII.GetBytes([Convert]::ToBase64String($encrypted))
      $stream.Write($bytes, 0, $bytes.Length)
      $stream.Flush($true)
    } finally { $stream.Dispose() }
    if ([IO.File]::Exists($Path)) { [IO.File]::Replace($temporary, $Path, [NullString]::Value) }
    else { [IO.File]::Move($temporary, $Path) }
  } finally { if ([IO.File]::Exists($temporary)) { [IO.File]::Delete($temporary) } }
}

function Invoke-ConnectorDelivery([string]$CompanyId, [scriptblock]$Claim, [scriptblock]$Send,
  [scriptblock]$Report, [scriptblock]$ReadJournal, [scriptblock]$WriteJournal, [scriptblock]$ClearJournal) {
  $pending = & $ReadJournal
  if ($pending -and ($pending.companyId -ne $CompanyId -or $pending.protocolVersion -ne 2 -or $pending.phase -notin @('prepared', 'result'))) {
    throw "El resultado guardado necesita revision. No se enviaran mas registros."
  }
  if (-not $pending) {
    $claimed = & $Claim
    if (-not $claimed.job) { return @{ status = 'waiting'; message = $claimed.message } }
    $job = $claimed.job
    if ($job.protocolVersion -ne 2) { throw "Actualiza el conector y la plataforma antes de enviar." }
    $pending = @{ companyId = $CompanyId; protocolVersion = 2; phase = 'prepared';
      operation = if ($job.operation) { [string]$job.operation } else { 'submit' };
      submissionId = $job.submissionId; attemptToken = $job.attemptToken; attemptNumber = [int]$job.attemptNumber }
    & $WriteJournal $pending
    # The prepared marker exists before sending. If Windows stops in the tiny
    # window before saving the response, recovery reports an uncertain outcome.
    $result = & $Send $job
    $pending.phase = 'result'
    $pending.result = $result
    & $WriteJournal $pending
  } elseif ($pending.phase -eq 'prepared') {
    $pending | Add-Member -NotePropertyName result -NotePropertyValue @{ httpStatus = 0; responseXml = ''; failureKind = 'network' } -Force
    $pending.phase = 'result'
    & $WriteJournal $pending
  }
  $receipt = @{
    companyId = $CompanyId; protocolVersion = 2; submissionId = $pending.submissionId;
    operation = if ($pending.operation) { [string]$pending.operation } else { 'submit' };
    attemptToken = $pending.attemptToken; attemptNumber = [int]$pending.attemptNumber;
    httpStatus = [int]$pending.result.httpStatus; responseXml = [string]$pending.result.responseXml;
    failureKind = [string]$pending.result.failureKind
  }
  $ack = & $Report $receipt
  if ($ack.acknowledged -ne $true) {
    return @{ status = 'needs_review'; retained = $true;
      message = 'El resultado esta protegido en este ordenador, pero necesita revision. No borres ni vuelvas a emitir la factura.' }
  }
  & $ClearJournal
  return @{ status = $ack.status; acknowledged = $true }
}
