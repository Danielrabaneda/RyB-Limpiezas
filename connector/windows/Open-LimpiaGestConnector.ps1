[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$ProtocolUrl
)

$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "Conectar este ordenador con LimpiaGest"
Clear-Host
Write-Host "LimpiaGest · Conexión con VeriFactu" -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Cyan
Write-Host "El código temporal se ha recibido automáticamente." -ForegroundColor White
Write-Host "No tienes que escribirlo de nuevo." -ForegroundColor White
Write-Host ""

try {
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
    throw "El código temporal no es válido. Vuelve a LimpiaGest y genera uno nuevo."
  }

  Write-Host "Conectando este ordenador..." -ForegroundColor Yellow
  $connector = Join-Path $PSScriptRoot "Connect-LimpiaGest.ps1"
  & $connector -CompanyId $companyId -PairingCode $pairingCode -ForcePair -PairOnly
  if ($LASTEXITCODE -ne 0) { throw "No se pudo conectar este ordenador." }

  Write-Host ""
  Write-Host "ORDENADOR CONECTADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host "No se ha enviado ninguna factura a la AEAT." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "NO SE HA PODIDO COMPLETAR LA CONEXIÓN" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Vuelve a LimpiaGest, genera un código nuevo y pulsa otra vez Abrir conector." -ForegroundColor Yellow
} finally {
  Write-Host ""
  Read-Host "Pulsa Intro cuando hayas leído el resultado para cerrar esta ventana"
}
