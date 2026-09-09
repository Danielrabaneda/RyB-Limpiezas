# Read-only release gate. Does not sign, install, connect or read private keys.
[CmdletBinding()]
param([string]$SourceDirectory = (Join-Path $PSScriptRoot '../connector/windows'))
$ErrorActionPreference = 'Stop'
$resolved = (Resolve-Path -LiteralPath $SourceDirectory).Path
$scripts = @(Get-ChildItem -LiteralPath $resolved -Filter '*.ps1' -File)
if ($scripts.Count -eq 0) { throw 'No PowerShell scripts found in release directory.' }
$failed = 0
foreach ($file in $scripts) {
  $signature = Get-AuthenticodeSignature -LiteralPath $file.FullName
  $codeSigning = $false
  if ($signature.SignerCertificate) {
    $codeSigning = @($signature.SignerCertificate.EnhancedKeyUsageList | Where-Object {
      $_.ObjectId.Value -eq '1.3.6.1.5.5.7.3.3'
    }).Count -gt 0
  }
  $valid = $signature.Status -eq 'Valid' -and $codeSigning -and $null -ne $signature.TimeStamperCertificate
  if (-not $valid) { $failed++ }
  [PSCustomObject]@{ File = $file.Name; Signature = [string]$signature.Status;
    CodeSigning = $codeSigning; Timestamped = $null -ne $signature.TimeStamperCertificate; ReleaseReady = $valid }
}
if ($failed) { throw "Release blocked: $failed script(s) lack a valid timestamped code-signing signature." }
