[CmdletBinding()]
param(
  [string]$CompanyId,
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$installDirectory = Join-Path $env:LOCALAPPDATA "LimpiaGest\ConectorVeriFactu"
$connectorSource = Join-Path $PSScriptRoot "Connect-LimpiaGest.ps1"
$connectorTarget = Join-Path $installDirectory "Connect-LimpiaGest.ps1"
$protocolHandlerSource = Join-Path $PSScriptRoot "Open-LimpiaGestConnector.ps1"
$protocolHandlerTarget = Join-Path $installDirectory "Open-LimpiaGestConnector.ps1"
$validatorSource = Join-Path $PSScriptRoot "Test-OfficialSoapSchema.ps1"
$schemasSource = Join-Path $PSScriptRoot "schemas"
$startupDirectory = [Environment]::GetFolderPath("Startup")
$shortcutPath = Join-Path $startupDirectory "LimpiaGest VeriFactu.lnk"
$programsDirectory = [Environment]::GetFolderPath("Programs")
$manualShortcutPath = Join-Path $programsDirectory "Conectar LimpiaGest VeriFactu.lnk"

if (-not (Test-Path -LiteralPath $connectorSource) -or -not (Test-Path -LiteralPath $protocolHandlerSource) -or -not (Test-Path -LiteralPath $validatorSource) -or -not (Test-Path -LiteralPath $schemasSource)) {
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
Copy-Item -LiteralPath $protocolHandlerSource -Destination $protocolHandlerTarget -Force
Copy-Item -LiteralPath $validatorSource -Destination (Join-Path $installDirectory "Test-OfficialSoapSchema.ps1") -Force
Copy-Item -LiteralPath $schemasSource -Destination (Join-Path $installDirectory "schemas") -Recurse -Force

& $connectorTarget -CompanyId $CompanyId -PairingCode $PairingCode -ForcePair -PairOnly
if ($LASTEXITCODE -ne 0) { throw "No se pudo comprobar la conexión." }

$protocolKey = "HKCU:\Software\Classes\limpiagest-verifactu"
New-Item -Path $protocolKey -Force | Out-Null
Set-Item -Path $protocolKey -Value "URL:LimpiaGest VeriFactu"
Set-ItemProperty -Path $protocolKey -Name "URL Protocol" -Value ""
$commandKey = Join-Path $protocolKey "shell\open\command"
New-Item -Path $commandKey -Force | Out-Null
$protocolCommand = "`"$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe`" -NoExit -NoProfile -ExecutionPolicy Bypass -File `"$protocolHandlerTarget`" `"%1`""
Set-Item -Path $commandKey -Value $protocolCommand

$shell = New-Object -ComObject WScript.Shell
$shortcut = $shell.CreateShortcut($shortcutPath)
$shortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$shortcut.Arguments = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$connectorTarget`" -CompanyId `"$CompanyId`""
$shortcut.WorkingDirectory = $installDirectory
$shortcut.Description = "Conector VeriFactu de LimpiaGest"
$shortcut.Save()

$manualShortcut = $shell.CreateShortcut($manualShortcutPath)
$manualShortcut.TargetPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
$manualShortcut.Arguments = "-NoExit -NoProfile -ExecutionPolicy Bypass -File `"$protocolHandlerTarget`" -CompanyId `"$CompanyId`""
$manualShortcut.WorkingDirectory = $installDirectory
$manualShortcut.Description = "Conectar este ordenador con LimpiaGest"
$manualShortcut.Save()

Write-Host "LimpiaGest ha quedado conectado y arrancara automaticamente al iniciar sesion." -ForegroundColor Green
