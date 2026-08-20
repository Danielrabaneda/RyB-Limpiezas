[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "LimpiaGest\ConectorVeriFactu"
$shortcutPath = Join-Path ([Environment]::GetFolderPath("Startup")) "LimpiaGest VeriFactu.lnk"

Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
  Where-Object { $_.CommandLine -like "*Connect-LimpiaGest.ps1*" } |
  ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }

if (Test-Path -LiteralPath $shortcutPath) { Remove-Item -LiteralPath $shortcutPath -Force }
if (Test-Path -LiteralPath $installDirectory) { Remove-Item -LiteralPath $installDirectory -Recurse -Force }

Write-Host "El conector de LimpiaGest se ha eliminado de este usuario de Windows." -ForegroundColor Green
