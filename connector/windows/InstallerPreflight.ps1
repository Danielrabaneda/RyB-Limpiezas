# Read-only validation; never opens certificates, credentials or journal contents.
function Assert-LimpiaGestInstallReady {
  param(
    [Parameter(Mandatory = $true)][string]$SourceDirectory,
    [Parameter(Mandatory = $true)][string]$InstallDirectory,
    [scriptblock]$ReadProcesses = { Get-CimInstance Win32_Process -ErrorAction Stop }
  )
  $source = (Resolve-Path -LiteralPath $SourceDirectory -ErrorAction Stop).Path
  $destination = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\', '/')
  if ($source.TrimEnd('\', '/') -eq $destination) {
    throw 'Extrae el paquete en otra carpeta antes de instalarlo.'
  }
  $required = @('Connect-LimpiaGest.ps1', 'ConnectorProtocol.ps1', 'Open-LimpiaGestConnector.ps1',
    'Test-OfficialSoapSchema.ps1', 'VERSION.json', 'schemas')
  foreach ($name in $required) {
    if (-not (Test-Path -LiteralPath (Join-Path $source $name))) { throw "Paquete incompleto: falta $name." }
  }
  $version = Get-Content -LiteralPath (Join-Path $source 'VERSION.json') -Raw | ConvertFrom-Json
  if ($version.protocolVersion -ne 2 -or $version.environment -ne 'test' -or
      $version.productionEnabled -cne $false -or -not $version.connectorVersion) {
    throw 'Este instalador solo admite el paquete de pruebas compatible con protocolo 2.'
  }
  foreach ($file in @(Get-ChildItem -LiteralPath $source -Recurse -Force)) {
    if (($file.Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'El paquete contiene enlaces de archivos no permitidos.'
    }
    if ($file.Extension -eq '.ps1') {
      $tokens = $null; $parseErrors = $null
      [Management.Automation.Language.Parser]::ParseFile($file.FullName, [ref]$tokens, [ref]$parseErrors) | Out-Null
      if ($parseErrors.Count) { throw "El archivo $($file.Name) no se puede interpretar. Descarga un paquete nuevo." }
    }
  }
  if (Test-Path -LiteralPath $destination) {
    if ((Get-Item -LiteralPath $destination -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
      throw 'La carpeta instalada no puede ser un enlace.'
    }
    # Shared installation: a receipt from ANY company must block replacement.
    $pending = @(Get-ChildItem -LiteralPath $destination -Filter '*.pending-result.dpapi' -File -Force)
    if ($pending.Count) {
      throw 'Hay resultados protegidos pendientes. Confirma o revisa esos resultados en LimpiaGest antes de actualizar. No borres archivos ni cambies la vinculacion.'
    }
    foreach ($entry in @(Get-ChildItem -LiteralPath $destination -Recurse -Force)) {
      if ($entry.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw 'La instalacion contiene enlaces no permitidos.' }
    }
  }
  try { $processes = @(& $ReadProcesses) } catch {
    throw 'No se ha podido comprobar si el conector esta abierto. No se modificara la instalacion.'
  }
  foreach ($process in $processes) {
    if ($process.Name -match '^(powershell|pwsh)(\.exe)?$' -and -not $process.CommandLine) {
      throw 'No se ha podido identificar una ventana de PowerShell. Cierra el conector y vuelve a intentarlo.'
    }
    if ($process.CommandLine -and $process.CommandLine.IndexOf($destination, [StringComparison]::OrdinalIgnoreCase) -ge 0 -and
        $process.CommandLine -match '(Connect-LimpiaGest|Open-LimpiaGestConnector)\.ps1') {
      throw 'El conector esta abierto. Cierralo de forma controlada antes de actualizar; no se detendra automaticamente.'
    }
  }
  return $version
}
