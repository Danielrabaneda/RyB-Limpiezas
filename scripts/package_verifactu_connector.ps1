# Package only distributable sources. Never include credentials or local journals.
$ErrorActionPreference = 'Stop'
$repository = Split-Path $PSScriptRoot -Parent
$source = Join-Path $repository 'connector/windows'
$target = Join-Path $repository 'public/downloads/LimpiaGest-Conector-Windows.zip'
$allowed = @('Connect-LimpiaGest.ps1', 'ConnectorProtocol.ps1', 'Install-LimpiaGestConnector.ps1',
  'Open-LimpiaGestConnector.ps1', 'Uninstall-LimpiaGestConnector.ps1', 'Instalar LimpiaGest.cmd',
  'Test-OfficialSoapSchema.ps1', 'Test-VerifactuCertificate.ps1', 'config.example.json',
  'schemas', 'README.md', 'LEEME.txt', 'VERSION.json')
$paths = @($allowed | ForEach-Object {
  $path = Join-Path $source $_
  if (-not (Test-Path -LiteralPath $path)) { throw "Missing distribution file: $_" }
  $path
})
Compress-Archive -LiteralPath $paths -DestinationPath $target -Force
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($target)
try {
  $entries = @($archive.Entries | ForEach-Object { $_.FullName.Replace('\', '/') })
  if ('ConnectorProtocol.ps1' -notin $entries -or 'VERSION.json' -notin $entries) { throw 'Incomplete protocol v2 package' }
  if ($entries | Where-Object { $_ -match '(?i)\.(pfx|p12|dpapi)$|pending-result|offline-journal-test' }) { throw 'Private file in package' }
  Write-Output "Protocol v2 package verified: $($entries.Count) files. Production blocked."
} finally { $archive.Dispose() }
