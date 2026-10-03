function Install-LimpiaGestFiles {
  param([string]$SourceDirectory, [string]$InstallDirectory, [scriptblock]$Validate,
    [scriptblock]$AfterBackup = {})
  $target = [IO.Path]::GetFullPath($InstallDirectory).TrimEnd('\', '/')
  $parent = Split-Path $target -Parent
  if ((Split-Path $target -Leaf) -ne 'ConectorVeriFactu') { throw 'Destino de instalacion no permitido.' }
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  $lockPath = Join-Path $parent 'connector-update.lock'
  try { $lock = [IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None') }
  catch { throw 'El conector o una actualizacion esta abierto. Cierralo antes de continuar.' }
  try {
    $stage = Join-Path $parent 'ConectorVeriFactu.update-stage'
    $backup = Join-Path $parent 'ConectorVeriFactu.update-backup'
    foreach ($path in @($parent, $target, $stage, $backup)) {
      if ((Test-Path -LiteralPath $path) -and ((Get-Item -LiteralPath $path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
        throw 'No se permiten enlaces en las carpetas de actualizacion.'
      }
    }
    # Interrupted between renames: restore the old complete directory first.
    if (-not (Test-Path -LiteralPath $target) -and (Test-Path -LiteralPath $backup)) {
      [IO.Directory]::Move($backup, $target)
    }
    & $Validate | Out-Null
    # Never delete old versions or private files: retain each under a unique name.
    foreach ($old in @($stage, $backup)) {
      if (Test-Path -LiteralPath $old) { [IO.Directory]::Move($old, ($old + '.retained-' + [guid]::NewGuid().ToString('N'))) }
    }
    New-Item -ItemType Directory -Path $stage | Out-Null
    if (Test-Path -LiteralPath $target) {
      Get-ChildItem -LiteralPath $target -Force | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination $stage -Recurse -Force }
    }
    $files = @('Connect-LimpiaGest.ps1','ConnectorProtocol.ps1','Open-LimpiaGestConnector.ps1',
      'Test-OfficialSoapSchema.ps1','VERSION.json')
    foreach ($name in $files) {
      $from = Join-Path $SourceDirectory $name
      $to = Join-Path $stage $name
      Copy-Item -LiteralPath $from -Destination $to -Force
      if ((Get-FileHash -LiteralPath $from).Hash -ne (Get-FileHash -LiteralPath $to).Hash) { throw 'Fallo al verificar los archivos preparados.' }
    }
    $schemaTarget = Join-Path $stage 'schemas'
    if (Test-Path -LiteralPath $schemaTarget) {
      [IO.Directory]::Move($schemaTarget, (Join-Path $stage ('schemas.retained-' + [guid]::NewGuid().ToString('N'))))
    }
    Copy-Item -LiteralPath (Join-Path $SourceDirectory 'schemas') -Destination $schemaTarget -Recurse
    foreach ($file in @(Get-ChildItem -LiteralPath (Join-Path $SourceDirectory 'schemas') -File -Recurse)) {
      $relative = $file.FullName.Substring((Join-Path $SourceDirectory 'schemas').Length).TrimStart('\','/')
      if ((Get-FileHash -LiteralPath $file.FullName).Hash -ne (Get-FileHash -LiteralPath (Join-Path $schemaTarget $relative)).Hash) { throw 'Esquema copiado incorrectamente.' }
    }
    & $Validate | Out-Null
    $moved = $false
    try {
      if (Test-Path -LiteralPath $target) { [IO.Directory]::Move($target, $backup); $moved = $true }
      & $AfterBackup
      [IO.Directory]::Move($stage, $target)
    } catch {
      if ($moved -and -not (Test-Path -LiteralPath $target)) { [IO.Directory]::Move($backup, $target) }
      throw
    }
  } finally { $lock.Dispose() }
}
