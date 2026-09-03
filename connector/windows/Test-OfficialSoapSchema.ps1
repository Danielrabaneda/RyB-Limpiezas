[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$SoapXml
)

$ErrorActionPreference = "Stop"
$schemaDirectory = Join-Path $PSScriptRoot "schemas\test"
[xml]$document = $SoapXml
$payload = $document.SelectSingleNode("//*[local-name()='RegFactuSistemaFacturacion']")
$isQuery = $false
if (-not $payload) {
  $payload = $document.SelectSingleNode("//*[local-name()='ConsultaFactuSistemaFacturacion']")
  $isQuery = $true
}
if (-not $payload) { throw "El sobre SOAP no contiene un envío o consulta oficial de VeriFactu." }

$settings = [Xml.XmlReaderSettings]::new()
$settings.ValidationType = [Xml.ValidationType]::Schema
$settings.DtdProcessing = [Xml.DtdProcessing]::Prohibit
$settings.XmlResolver = [Xml.XmlUrlResolver]::new()
[void]$settings.Schemas.Add("https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd", (Join-Path $schemaDirectory "SuministroInformacion.xsd"))
if ($isQuery) {
  [void]$settings.Schemas.Add("https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/ConsultaLR.xsd", (Join-Path $schemaDirectory "ConsultaLR.xsd"))
} else {
  [void]$settings.Schemas.Add("https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd", (Join-Path $schemaDirectory "SuministroLR.xsd"))
}
[void]$settings.Schemas.Add("http://www.w3.org/2000/09/xmldsig#", (Join-Path $schemaDirectory "xmldsig-core-schema.xsd"))
$errors = [Collections.Generic.List[string]]::new()
$handler = [Xml.Schema.ValidationEventHandler]{ param($sender, $eventArgs) $errors.Add($eventArgs.Message) }
$settings.add_ValidationEventHandler($handler)

$reader = [Xml.XmlReader]::Create([IO.StringReader]::new($payload.OuterXml), $settings)
try {
  while ($reader.Read()) { }
} finally {
  $reader.Dispose()
}
if ($errors.Count) { throw ($errors -join [Environment]::NewLine) }
Write-Output $(if ($isQuery) { "La consulta cumple ConsultaLR.xsd y SuministroInformacion.xsd." } else { "El registro cumple SuministroLR.xsd y SuministroInformacion.xsd." })
