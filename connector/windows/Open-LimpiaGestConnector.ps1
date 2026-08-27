[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProtocolUrl
)

$ErrorActionPreference = "Stop"
$uri = [Uri]$ProtocolUrl
if ($uri.Scheme -ne "limpiagest-verifactu" -or $uri.Host -ne "pair") {
  throw "Enlace de conexión de LimpiaGest no válido."
}

$parameters = @{}
foreach ($part in $uri.Query.TrimStart("?").Split("&", [StringSplitOptions]::RemoveEmptyEntries)) {
  $pieces = $part.Split("=", 2)
  $name = [Uri]::UnescapeDataString($pieces[0])
  $value = if ($pieces.Count -eq 2) { [Uri]::UnescapeDataString($pieces[1]) } else { "" }
  $parameters[$name] = $value
}

$companyId = ([string]$parameters.companyId).Trim()
$pairingCode = ([string]$parameters.code).Trim().ToUpperInvariant()
if ($companyId -notmatch "^[a-zA-Z0-9_-]{1,128}$" -or $pairingCode -notmatch "^[A-Z2-9]{10}$") {
  throw "El identificador o el código temporal no son válidos. Genera un código nuevo en LimpiaGest."
}

$connector = Join-Path $PSScriptRoot "Connect-LimpiaGest.ps1"
& $connector -CompanyId $companyId -PairingCode $pairingCode -ForcePair -PairOnly
if ($LASTEXITCODE -ne 0) { throw "No se pudo conectar este ordenador." }

Write-Host "Puedes cerrar esta ventana y volver a LimpiaGest." -ForegroundColor Cyan
Read-Host "Pulsa Intro para cerrar"
