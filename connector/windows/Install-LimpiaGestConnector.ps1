[CmdletBinding()]
param(
  [string]$CompanyId,
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "LimpiaGest\ConectorVeriFactu"
$connectorSource = Join-Path $PSScriptRoot "Connect-LimpiaGest.ps1"
$connectorTarget = Join-Path $installDirectory "Connect-LimpiaGest.ps1"
$validatorSource = Join-Path $PSScriptRoot "Test-OfficialSoapSchema.ps1"
$schemasSource = Join-Path $PSScriptRoot "schemas"
$startupDirectory = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDirectory "LimpiaGest VeriFactu.lnk"

if (-not (Test-Path -LiteralPath $connectorSource) -or -not (Test-Path -LiteralPath $validatorSource) -or -not (Test-Path -LiteralPath $schemasSource)) {
  throw "No se encuentra el conector junto al instalador."
}
if (-not $CompanyId) {
  $CompanyId = Read-Host "Escribe el identificador de empresa que muestra LimpiaGest"
}
if (-not $PairingCode) {
  $PairingCode = Read-Host "Escribe el código de 10 caracteres que muestra LimpiaGest"
}

New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $connectorSource -Destination $connectorTarget -Force
Copy-Item -LiteralPath $validatorSource -Destination (Join-Path $installDirectory "Test-OfficialSoapSchema.ps1") -Force
Copy-Item -LiteralPath $schemasSource -Destination (Join-Path $installDirectory "schemas") -Recurse -Force

& $connectorTarget -CompanyId $CompanyId -PairingCode $PairingCode -Once
if ($LASTEXITCODE -ne 0) { throw "No se pudo comprobar la conexión." }

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$connectorTarget`" -CompanyId `"$CompanyId`""
$shortcut.WorkingDirectory = $installDirectory
$shortcut.Description = "Conector VeriFactu de LimpiaGest"
$shortcut.Save()

Start-Process -FilePath $shortcut.TargetPath -ArgumentList $shortcut.Arguments -WindowStyle Hidden
Write-Host "LimpiaGest ha quedado conectado y arrancará automáticamente al iniciar sesión." -ForegroundColor Green
