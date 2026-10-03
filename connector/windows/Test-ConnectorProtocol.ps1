# Offline tests only: synthetic data, no certificate store and no network.
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'ConnectorProtocol.ps1')
$script:checks = 0
function Check([bool]$Condition, [string]$Message) {
  if (-not $Condition) { throw "FAILED: $Message" }
  $script:checks++
}
function Must-Fail([scriptblock]$Action) {
  $failed = $false
  try { & $Action | Out-Null } catch { $failed = $true }
  Check $failed 'Expected safe refusal'
}
function Reset-TestState {
  $script:state = @{ journal = $null; claims = 0; sends = 0; reports = 0; writes = 0; clear = 0;
    failReport = $false; failWrite = 0; acknowledge = $true; status = 'accepted' }
}
function Test-Step {
  Invoke-ConnectorDelivery -CompanyId 'offline-test' -ReadJournal { $script:state.journal } -WriteJournal {
    param($value)
    $script:state.writes++
    if ($script:state.failWrite -eq $script:state.writes) { throw 'simulated disk failure' }
    $script:state.journal = $value | ConvertTo-Json -Depth 8 | ConvertFrom-Json
  } -ClearJournal { $script:state.clear++; $script:state.journal = $null } -Claim {
    $script:state.claims++
    @{ job = @{ submissionId = 'alta_i'; operation = 'query'; protocolVersion = 2; attemptToken = 'attempt-1'; attemptNumber = 1 } }
  } -Send {
    param($job)
    $script:state.sends++
    @{ httpStatus = 200; responseXml = '<synthetic-response/>'; failureKind = '' }
  } -Report {
    param($receipt)
    $script:state.reports++
    $script:state.receipt = $receipt
    if ($script:state.failReport) { throw 'simulated platform outage' }
    @{ acknowledged = $script:state.acknowledge; status = $script:state.status }
  }
}

Reset-TestState
$result = Test-Step
Check ($result.status -eq 'accepted' -and $state.sends -eq 1 -and $state.writes -eq 2 -and $state.clear -eq 1) 'normal cycle'
Check ($state.receipt.operation -eq 'query') 'operation survives durable journal and receipt'

Reset-TestState
$state.failReport = $true
Must-Fail { Test-Step }
Check ($state.journal.phase -eq 'result' -and $state.sends -eq 1 -and $state.clear -eq 0) 'retain result while offline'
$state.failReport = $false
$result = Test-Step
Check ($state.claims -eq 1 -and $state.sends -eq 1 -and $state.reports -eq 2 -and $state.clear -eq 1) 'retry only receipt, not AEAT send'

Reset-TestState
$state.failWrite = 1
Must-Fail { Test-Step }
Check ($state.sends -eq 0) 'no send without durable prepared marker'

Reset-TestState
$state.failWrite = 2
Must-Fail { Test-Step }
Check ($state.journal.phase -eq 'prepared' -and $state.sends -eq 1) 'preserve prepared marker if response write fails'
$state.failWrite = 0
$state.status = 'retry_pending'
$result = Test-Step
Check ($state.sends -eq 1 -and $state.receipt.httpStatus -eq 0 -and $state.receipt.failureKind -eq 'network') 'report uncertainty after crash, no blind network resend'

Reset-TestState
$state.acknowledge = $false
$result = Test-Step
Check ($result.retained -and $state.journal.phase -eq 'result' -and $state.clear -eq 0) 'stale receipt retained for review'
$result = Test-Step
Check ($state.sends -eq 1 -and $state.claims -eq 1) 'no new job while review is pending'

Reset-TestState
$state.journal = [pscustomobject]@{ companyId = 'other'; protocolVersion = 2; phase = 'result' }
Must-Fail { Test-Step }
Check ($state.claims -eq 0 -and $state.sends -eq 0 -and $state.reports -eq 0) 'tenant-bound journal'

$job = @{ operation = 'query'; protocolVersion = 2; environment = 'test'; productionEnabled = $false;
  endpoint = 'https://prewww1.aeat.es/wlpl/TIKE-CONT/ws/SistemaFacturacion/VerifactuSOAP';
  attemptToken = 'attempt-1'; attemptNumber = 1; leaseExpiresAt = [DateTimeOffset]::UtcNow.AddMinutes(2).ToString('o');
  soapXml = '<synthetic/>'; soapSha256 = Get-ConnectorXmlHash '<synthetic/>'; expectedTaxId = 'B04843843' }
$cert = [pscustomobject]@{ HasPrivateKey = $true; NotBefore = (Get-Date).AddDays(-1); NotAfter = (Get-Date).AddDays(1) }
Assert-ConnectorJob $job $cert 'B04843843'
Check $true 'valid synthetic job'
foreach ($patch in @(@{ environment = 'production' }, @{ productionEnabled = $true }, @{ endpoint = 'https://example.com/' },
  @{ protocolVersion = 1 }, @{ operation = 'delete' }, @{ soapSha256 = 'bad' }, @{ expectedTaxId = 'OTHER' },
  @{ leaseExpiresAt = [DateTimeOffset]::UtcNow.AddSeconds(-1).ToString('o') })) {
  $modified = $job.Clone()
  foreach ($key in $patch.Keys) { $modified[$key] = $patch[$key] }
  Must-Fail { Assert-ConnectorJob $modified $cert 'B04843843' }
}
$cert.HasPrivateKey = $false
Must-Fail { Assert-ConnectorJob $job $cert 'B04843843' }

# A synthetic journal under this repository tests Windows DPAPI and atomic replacement.
$tempDirectory = Join-Path $PSScriptRoot ('offline-journal-test-' + [Guid]::NewGuid().ToString('N'))
[void][IO.Directory]::CreateDirectory($tempDirectory)
$journal = Join-Path $tempDirectory 'synthetic.dpapi'
try {
  Write-ConnectorJournal $journal @{ marker = 'SYNTHETIC-NOT-A-REAL-RECEIPT'; phase = 'prepared' }
  Check (-not [IO.File]::ReadAllText($journal).Contains('SYNTHETIC-NOT-A-REAL-RECEIPT')) 'journal ciphertext contains no plaintext'
  Check ((Read-ConnectorJournal $journal).phase -eq 'prepared') 'DPAPI round trip'
  Write-ConnectorJournal $journal @{ marker = 'SYNTHETIC-NOT-A-REAL-RECEIPT'; phase = 'result' }
  Check ((Read-ConnectorJournal $journal).phase -eq 'result') 'atomic replacement round trip'
} finally {
  if ([IO.File]::Exists($journal)) { [IO.File]::Delete($journal) }
  [IO.Directory]::Delete($tempDirectory, $false)
}

foreach ($name in @('Connect-LimpiaGest.ps1', 'ConnectorProtocol.ps1', 'Install-LimpiaGestConnector.ps1')) {
  $tokens = $null; $errors = $null
  [void][Management.Automation.Language.Parser]::ParseFile((Join-Path $PSScriptRoot $name), [ref]$tokens, [ref]$errors)
  Check ($errors.Count -eq 0) "PowerShell syntax: $name"
}
Write-Output "$script:checks offline Windows checks passed. No certificates or AEAT accessed."
