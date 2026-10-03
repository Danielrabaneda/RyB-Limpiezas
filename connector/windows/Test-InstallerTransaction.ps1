$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'InstallerTransaction.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('limpiagest-transaction-' + [guid]::NewGuid().ToString('N'))
$target = Join-Path $fixture 'ConectorVeriFactu'
New-Item -ItemType Directory -Path $target | Out-Null
[IO.File]::WriteAllText((Join-Path $target 'tenant.json'), 'synthetic-private-token')
[IO.File]::WriteAllText((Join-Path $target 'old.txt'), 'old')
$passed = 0
try {
  Install-LimpiaGestFiles $PSScriptRoot $target {} { throw 'simulated failure' }
  throw 'Expected failure'
} catch { if ($_.Exception.Message -ne 'simulated failure') { throw } }
if (-not (Test-Path -LiteralPath (Join-Path $target 'old.txt'))) { throw 'Rollback failed' }; $passed++
Install-LimpiaGestFiles $PSScriptRoot $target {}
if ([IO.File]::ReadAllText((Join-Path $target 'tenant.json')) -ne 'synthetic-private-token') { throw 'Private data lost' }; $passed++
if (-not (Test-Path -LiteralPath (Join-Path $fixture 'ConectorVeriFactu.update-backup/old.txt'))) { throw 'Backup lost' }; $passed++
$guard = [IO.File]::Open((Join-Path $fixture 'connector-update.lock'), 'Open', 'ReadWrite', 'ReadWrite')
try {
  $blocked = $false
  try { Install-LimpiaGestFiles $PSScriptRoot $target {} } catch { $blocked = $true }
  if (-not $blocked) { throw 'Active reader did not block update' }; $passed++
} finally { $guard.Dispose() }
# Simulate termination between the two directory renames, on a separate fixture.
$crashRoot = Join-Path $fixture 'crash'
New-Item -ItemType Directory -Path $crashRoot | Out-Null
$crashBackup = Join-Path $crashRoot 'ConectorVeriFactu.update-backup'
New-Item -ItemType Directory -Path $crashBackup | Out-Null
[IO.File]::WriteAllText((Join-Path $crashBackup 'tenant.json'), 'preserved')
$crashTarget = Join-Path $crashRoot 'ConectorVeriFactu'
Install-LimpiaGestFiles $PSScriptRoot $crashTarget {}
if ([IO.File]::ReadAllText((Join-Path $crashTarget 'tenant.json')) -ne 'preserved') { throw 'Crash recovery lost data' }; $passed++
Write-Output "$passed transaction tests passed; synthetic fixtures retained: $fixture"
