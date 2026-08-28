[CmdletBinding()]
param(
  [string]$ProtocolUrl,
  [string]$CompanyId,
  [string]$PairingCode
)

$ErrorActionPreference = "Stop"
$host.UI.RawUI.WindowTitle = "Conectar este ordenador con LimpiaGest"
Clear-Host
Write-Host "LimpiaGest - Conexion con VeriFactu" -ForegroundColor Cyan
Write-Host "-----------------------------------" -ForegroundColor Cyan
if ($ProtocolUrl) {
  Write-Host "El codigo temporal se ha recibido automaticamente." -ForegroundColor White
  Write-Host "No tienes que escribirlo de nuevo." -ForegroundColor White
} else {
  Write-Host "Escribe o pega el codigo temporal mostrado en LimpiaGest." -ForegroundColor White
}
Write-Host ""

try {
  if ($ProtocolUrl) {
    $uri = [Uri]$ProtocolUrl
    if ($uri.Scheme -ne "limpiagest-verifactu" -or $uri.Host -ne "pair") {
      throw "Enlace de conexion de LimpiaGest no valido."
    }

    $parameters = @{}
    foreach ($part in $uri.Query.TrimStart("?").Split("&", [StringSplitOptions]::RemoveEmptyEntries)) {
      $pieces = $part.Split("=", 2)
      $name = [Uri]::UnescapeDataString($pieces[0])
      $value = if ($pieces.Count -eq 2) { [Uri]::UnescapeDataString($pieces[1]) } else { "" }
      $parameters[$name] = $value
    }

    $CompanyId = [string]$parameters.companyId
    $PairingCode = [string]$parameters.code
  }

  if (-not $CompanyId) { $CompanyId = Read-Host "Identificador de empresa" }
  if (-not $PairingCode) { $PairingCode = Read-Host "Codigo temporal" }
  $CompanyId = $CompanyId.Trim()
  $PairingCode = $PairingCode.Trim().ToUpperInvariant()
  if ($CompanyId -notmatch "^[a-zA-Z0-9_-]{1,128}$" -or $PairingCode -notmatch "^[A-Z2-9]{10}$") {
    throw "El codigo temporal no es valido. Vuelve a LimpiaGest y genera uno nuevo."
  }

  Write-Host "Conectando este ordenador..." -ForegroundColor Yellow
  $connector = Join-Path $PSScriptRoot "Connect-LimpiaGest.ps1"
  & $connector -CompanyId $CompanyId -PairingCode $PairingCode -ForcePair -PairOnly
  if ($LASTEXITCODE -ne 0) { throw "No se pudo conectar este ordenador." }

  Write-Host ""
  Write-Host "ORDENADOR CONECTADO CORRECTAMENTE" -ForegroundColor Green
  Write-Host "No se ha enviado ninguna factura a la AEAT." -ForegroundColor Green
} catch {
  Write-Host ""
  Write-Host "NO SE HA PODIDO COMPLETAR LA CONEXION" -ForegroundColor Red
  Write-Host $_.Exception.Message -ForegroundColor Red
  Write-Host "Vuelve a LimpiaGest, genera un codigo nuevo y pulsa otra vez Abrir conector." -ForegroundColor Yellow
} finally {
  Write-Host ""
  Read-Host "Pulsa Intro cuando hayas leido el resultado para cerrar esta ventana"
}
