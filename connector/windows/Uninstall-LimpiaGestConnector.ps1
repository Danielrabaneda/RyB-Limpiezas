[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "LimpiaGest\ConectorVeriFactu"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) "LimpiaGest VeriFactu.lnk"
$manualShortcutPath = Join-Path ([Environment]::GetFolderPath("Programs")) "Conectar LimpiaGest VeriFactu.lnk"
$protocolKey = "HKCU:\Software\Classes\limpiagest-verifactu"
$expectedDirectory = [IO.Path]::GetFullPath((Join-Path $env:LOCALAPPDATA 'LimpiaGest\ConectorVeriFactu'))
if ([IO.Path]::GetFullPath($installDirectory) -ne $expectedDirectory) { throw 'Directorio de desinstalacion no valido.' }
$installedScriptPattern = [regex]::Escape((Join-Path $expectedDirectory 'Connect-LimpiaGest.ps1'))

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -match $installedScriptPattern } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path -LiteralPath $expectedDirectory) {
  $pending = @(Get-ChildItem -LiteralPath $expectedDirectory -Filter '*.pending-result.dpapi' -File)
  if ($pending.Count -gt 0) {
    throw 'El conector se ha detenido, pero conserva resultados protegidos pendientes. No se ha borrado nada. Resuelve la incidencia antes de desinstalar.'
  }
}

if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath -Force }
if (Test-Path -LiteralPath $manualShortcutPath) { Remove-Item -LiteralPath $manualShortcutPath -Force }
if (Test-Path -LiteralPath $protocolKey) { Remove-Item -LiteralPath $protocolKey -Recurse -Force }
if (Test-Path -LiteralPath $installDirectory) { Remove-Item -LiteralPath $installDirectory -Recurse -Force }

Write-Host "El conector de LimpiaGest se ha eliminado de este usuario de Windows." -ForegroundColor Green
