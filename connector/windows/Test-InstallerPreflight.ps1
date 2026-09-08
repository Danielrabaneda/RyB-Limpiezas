$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'InstallerPreflight.ps1')
$fixture = Join-Path ([IO.Path]::GetTempPath()) ('limpiagest-installer-test-' + [guid]::NewGuid().ToString('N'))
$source = Join-Path $fixture 'package'
$installed = Join-Path $fixture 'installed'
New-Item -ItemType Directory -Path $source, $installed | Out-Null
foreach ($name in @('Connect-LimpiaGest.ps1','ConnectorProtocol.ps1','Open-LimpiaGestConnector.ps1','Test-OfficialSoapSchema.ps1','VERSION.json','schemas')) {
  Copy-Item -LiteralPath (Join-Path $PSScriptRoot $name) -Destination (Join-Path $source $name) -Recurse
}
$passed = 0
function Check-Blocked([scriptblock]$Action, [string]$Pattern) {
  $caught = $false
  try { & $Action | Out-Null } catch {
    if ($_.Exception.Message -notmatch $Pattern) { throw }
    $caught = $true
  }
  if (-not $caught) { throw "Expected refusal: $Pattern" }
  $script:passed++
}
$version = Assert-LimpiaGestInstallReady $source $installed { @() }
if ($version.protocolVersion -ne 2) { throw 'Incorrect version' }; $passed++
Check-Blocked { Assert-LimpiaGestInstallReady $source $installed { throw 'unavailable' } } 'comprobar'
Check-Blocked { Assert-LimpiaGestInstallReady $source $installed { @([pscustomobject]@{Name='powershell.exe';CommandLine=$null}) } } 'identificar'
$active = [pscustomobject]@{ Name='powershell.exe'; CommandLine="powershell -File `"$installed\Connect-LimpiaGest.ps1`"" }
Check-Blocked { Assert-LimpiaGestInstallReady $source $installed { @($active) } } 'abierto'
Check-Blocked { Assert-LimpiaGestInstallReady $source $source { @() } } 'otra carpeta'
$receipt = Join-Path $installed 'other-company.pending-result.dpapi'
[IO.File]::WriteAllText($receipt, 'synthetic-receipt-no-secrets')
Check-Blocked { Assert-LimpiaGestInstallReady $source $installed { @() } } 'resultados protegidos'
if ([IO.File]::ReadAllText($receipt) -ne 'synthetic-receipt-no-secrets') { throw 'Receipt changed' }; $passed++
$emptyInstall = Join-Path $fixture 'clean-install'
[IO.File]::WriteAllText((Join-Path $source 'VERSION.json'), '{"protocolVersion":2,"environment":"production","productionEnabled":true,"connectorVersion":"test"}')
Check-Blocked { Assert-LimpiaGestInstallReady $source $emptyInstall { @() } } 'pruebas compatible'
Copy-Item -LiteralPath (Join-Path $PSScriptRoot 'VERSION.json') -Destination (Join-Path $source 'VERSION.json') -Force
[IO.File]::WriteAllText((Join-Path $source 'Connect-LimpiaGest.ps1'), 'function invalid {')
Check-Blocked { Assert-LimpiaGestInstallReady $source $emptyInstall { @() } } 'interpretar'
if (Test-Path -LiteralPath $emptyInstall) { throw 'Preflight wrote installation directory' }; $passed++
Write-Output "$passed offline installer checks passed. Synthetic fixtures retained at $fixture"
