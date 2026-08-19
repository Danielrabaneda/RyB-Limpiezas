[CmdletBinding()]
param(
  [string]$ConfigPath = (Join-Path $PSScriptRoot "config.json"),
  [switch]$SkipNetwork
)

$ErrorActionPreference = "Stop"

function Normalize-Thumbprint([string]$Value) {
  return ($Value -replace "[^a-fA-F0-9]", "").ToUpperInvariant()
}

if (-not (Test-Path -LiteralPath $ConfigPath)) {
  throw "No existe $ConfigPath. Copia config.example.json como config.json."
}

$config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
$thumbprint = Normalize-Thumbprint $config.certificateThumbprint
$storeLocation = [System.Security.Cryptography.X509Certificates.StoreLocation]::$($config.certificateStore)
$store = [System.Security.Cryptography.X509Certificates.X509Store]::new("My", $storeLocation)

try {
  $store.Open([System.Security.Cryptography.X509Certificates.OpenFlags]::ReadOnly)
  $matches = $store.Certificates.Find(
    [System.Security.Cryptography.X509Certificates.X509FindType]::FindByThumbprint,
    $thumbprint,
    $false
  )
  if ($matches.Count -ne 1) {
    throw "Se esperaba un certificado y se encontraron $($matches.Count)."
  }
  $certificate = $matches[0]
} finally {
  $store.Close()
}

if (-not $certificate.HasPrivateKey) {
  throw "El certificado no tiene una clave privada accesible."
}
if ($certificate.NotAfter -le (Get-Date)) {
  throw "El certificado está caducado desde $($certificate.NotAfter)."
}
if ($certificate.Subject -notmatch [regex]::Escape($config.expectedIssuerTaxId)) {
  throw "El certificado no contiene el NIF esperado $($config.expectedIssuerTaxId)."
}

$chain = [System.Security.Cryptography.X509Certificates.X509Chain]::new()
$chain.ChainPolicy.RevocationMode = [System.Security.Cryptography.X509Certificates.X509RevocationMode]::Online
$chain.ChainPolicy.RevocationFlag = [System.Security.Cryptography.X509Certificates.X509RevocationFlag]::EntireChain
$chainOk = $chain.Build($certificate)
$chainErrors = @($chain.ChainStatus | ForEach-Object { $_.StatusInformation.Trim() } | Where-Object { $_ })

$result = [ordered]@{
  certificateFound = $true
  subject = $certificate.Subject
  issuer = $certificate.Issuer
  thumbprint = $certificate.Thumbprint
  notAfter = $certificate.NotAfter.ToString("yyyy-MM-dd")
  daysUntilExpiry = [math]::Floor(($certificate.NotAfter - (Get-Date)).TotalDays)
  hasPrivateKey = $certificate.HasPrivateKey
  chainValid = $chainOk
  chainErrors = $chainErrors
  aeatWsdlReachable = $null
  networkError = $null
}

if (-not $SkipNetwork) {
  $handler = [System.Net.Http.HttpClientHandler]::new()
  $handler.ClientCertificates.Add($certificate)
  $handler.CheckCertificateRevocationList = $true
  $client = [System.Net.Http.HttpClient]::new($handler)
  $client.Timeout = [TimeSpan]::FromSeconds(30)
  try {
    $response = $client.GetAsync([string]$config.aeatWsdl).GetAwaiter().GetResult()
    $result.aeatWsdlReachable = $response.IsSuccessStatusCode
    if (-not $response.IsSuccessStatusCode) {
      $result.networkError = "HTTP $([int]$response.StatusCode) $($response.ReasonPhrase)"
    }
  } catch {
    $result.aeatWsdlReachable = $false
    $result.networkError = $_.Exception.Message
  } finally {
    $client.Dispose()
    $handler.Dispose()
  }
}

[PSCustomObject]$result

if (-not $result.chainValid) { exit 2 }
if (-not $SkipNetwork -and -not $result.aeatWsdlReachable) { exit 3 }
