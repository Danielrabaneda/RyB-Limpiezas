const AEAT_CHANNELS = new Set([
  "disabled",
  "delegated",
  "local_connector",
]);
const AEAT_ENVIRONMENTS = new Set(["test"]);
const AEAT_JOB_STATUSES = new Set([
  "awaiting_sender",
  "awaiting_local_connector",
  "processing",
  "accepted",
  "accepted_with_errors",
  "rejected",
  "retry_pending",
]);

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeAeatConnectionProfile(input = {}) {
  const channel = AEAT_CHANNELS.has(input.channel)
    ? input.channel
    : "disabled";
  const environment = AEAT_ENVIRONMENTS.has(input.environment)
    ? input.environment
    : "test";
  return {
    channel,
    environment,
    adviserName:
      channel === "delegated"
        ? String(input.adviserName || "").trim().slice(0, 160)
        : "",
    adviserTaxId:
      channel === "delegated"
        ? String(input.adviserTaxId || "").trim().toUpperCase().slice(0, 20)
        : "",
    adviserEmail:
      channel === "delegated"
        ? String(input.adviserEmail || "").trim().toLowerCase().slice(0, 160)
        : "",
    connectorName:
      channel === "local_connector"
        ? String(input.connectorName || "").trim().slice(0, 100)
        : "",
    productionEnabled: false,
    credentialsStored: false,
    schemaValidationStatus: "pending_official_xsd",
  };
}

function getInitialSubmissionStatus(channel) {
  if (channel === "delegated") return "awaiting_sender";
  if (channel === "local_connector") {
    return "awaiting_local_connector";
  }
  return null;
}

function buildTaxBreakdownXml(taxBreakdown = []) {
  return taxBreakdown
    .map((entry) => {
      const treatment = escapeXml(entry.taxTreatment || "taxable");
      return [
        "      <ryb:DetalleDesglose>",
        `        <ryb:Tratamiento>${treatment}</ryb:Tratamiento>`,
        `        <ryb:TipoImpositivo>${Number(entry.taxRate || 0).toFixed(2)}</ryb:TipoImpositivo>`,
        `        <ryb:BaseImponible>${Number(entry.taxableBase || 0).toFixed(2)}</ryb:BaseImponible>`,
        `        <ryb:CuotaRepercutida>${Number(entry.taxAmount || 0).toFixed(2)}</ryb:CuotaRepercutida>`,
        `        <ryb:TipoRecargoEquivalencia>${Number(entry.surchargeRate || 0).toFixed(2)}</ryb:TipoRecargoEquivalencia>`,
        `        <ryb:CuotaRecargoEquivalencia>${Number(entry.surchargeAmount || 0).toFixed(2)}</ryb:CuotaRecargoEquivalencia>`,
        entry.exemptionCause
          ? `        <ryb:CausaExencion>${escapeXml(entry.exemptionCause)}</ryb:CausaExencion>`
          : "",
        entry.nonSubjectCause
          ? `        <ryb:CausaNoSujecion>${escapeXml(entry.nonSubjectCause)}</ryb:CausaNoSujecion>`
          : "",
        "      </ryb:DetalleDesglose>",
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

/**
 * Genera un paquete XML de transporte estable a partir del registro fiscal.
 *
 * No se etiqueta como XML final admitido por la AEAT hasta validarlo contra
 * SuministroLR.xsd y el WSDL vigentes. El conector sustituirá el contenedor
 * `ryb:PaqueteRegistroFacturacion` por el sobre SOAP oficial sin recalcular ni
 * alterar los datos fiscales contenidos.
 */
function buildAeatSubmissionDraftXml(fiscalRecord, settings = {}) {
  const taxXml = buildTaxBreakdownXml(fiscalRecord.taxBreakdown || []);
  const previous = fiscalRecord.chain || {};
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<ryb:PaqueteRegistroFacturacion xmlns:ryb="urn:ryb:verifactu:transport:v1">',
    "  <ryb:Control>",
    "    <ryb:Entorno>PRUEBAS</ryb:Entorno>",
    "    <ryb:ValidacionXsd>PENDIENTE</ryb:ValidacionXsd>",
    "    <ryb:ProduccionHabilitada>false</ryb:ProduccionHabilitada>",
    "  </ryb:Control>",
    "  <ryb:Emisor>",
    `    <ryb:NombreRazon>${escapeXml(settings.companyName || "")}</ryb:NombreRazon>`,
    `    <ryb:NIF>${escapeXml(fiscalRecord.issuerNif || settings.nif || "")}</ryb:NIF>`,
    "  </ryb:Emisor>",
    "  <ryb:Registro>",
    `    <ryb:TipoRegistro>${escapeXml(fiscalRecord.recordType || "alta")}</ryb:TipoRegistro>`,
    `    <ryb:TipoFactura>${escapeXml(fiscalRecord.invoiceType || "F1")}</ryb:TipoFactura>`,
    `    <ryb:NumeroSerie>${escapeXml(fiscalRecord.invoiceNumber || "")}</ryb:NumeroSerie>`,
    `    <ryb:FechaExpedicion>${escapeXml(fiscalRecord.fechaExpedicionFactura || "")}</ryb:FechaExpedicion>`,
    `    <ryb:FechaHoraGeneracion>${escapeXml(fiscalRecord.fechaHoraHusoGenRegistro || "")}</ryb:FechaHoraGeneracion>`,
    `    <ryb:BaseTotal>${Number(fiscalRecord.subtotal || 0).toFixed(2)}</ryb:BaseTotal>`,
    `    <ryb:CuotaTotal>${Number(fiscalRecord.taxAmount || 0).toFixed(2)}</ryb:CuotaTotal>`,
    `    <ryb:RecargoTotal>${Number(fiscalRecord.surchargeAmount || 0).toFixed(2)}</ryb:RecargoTotal>`,
    `    <ryb:ImporteTotal>${Number(fiscalRecord.totalAmount || 0).toFixed(2)}</ryb:ImporteTotal>`,
    "    <ryb:Destinatario>",
    `      <ryb:NombreRazon>${escapeXml(fiscalRecord.client?.name || "")}</ryb:NombreRazon>`,
    `      <ryb:Identificacion>${escapeXml(fiscalRecord.client?.taxId || "")}</ryb:Identificacion>`,
    `      <ryb:TipoIdentificacion>${escapeXml(fiscalRecord.client?.idType || "NIF")}</ryb:TipoIdentificacion>`,
    `      <ryb:Pais>${escapeXml(fiscalRecord.client?.countryCode || "ES")}</ryb:Pais>`,
    "    </ryb:Destinatario>",
    "    <ryb:Desglose>",
    taxXml,
    "    </ryb:Desglose>",
    "    <ryb:Encadenamiento>",
    `      <ryb:RegistroAnterior>${escapeXml(previous.previousFiscalRecordId || "")}</ryb:RegistroAnterior>`,
    `      <ryb:HuellaAnterior>${escapeXml(previous.previousHash || "")}</ryb:HuellaAnterior>`,
    `      <ryb:Huella>${escapeXml(previous.hash || "")}</ryb:Huella>`,
    `      <ryb:Algoritmo>${escapeXml(previous.algorithm || "SHA-256")}</ryb:Algoritmo>`,
    "    </ryb:Encadenamiento>",
    "  </ryb:Registro>",
    "</ryb:PaqueteRegistroFacturacion>",
  ].join("\n");
}

function buildSubmissionManifest({
  companyId,
  fiscalRecordId,
  fiscalRecord,
  profile,
}) {
  return {
    format: "ryb-aeat-transport-package",
    version: 1,
    companyId,
    fiscalRecordId,
    invoiceId: fiscalRecord.invoiceId,
    invoiceNumber: fiscalRecord.invoiceNumber,
    recordType: fiscalRecord.recordType,
    issuerNif: fiscalRecord.issuerNif,
    fiscalHash: fiscalRecord.chain?.hash || "",
    channel: profile.channel,
    environment: profile.environment,
    productionEnabled: false,
    schemaValidationStatus: profile.schemaValidationStatus,
  };
}

module.exports = {
  AEAT_CHANNELS,
  AEAT_JOB_STATUSES,
  buildAeatSubmissionDraftXml,
  buildSubmissionManifest,
  escapeXml,
  getInitialSubmissionStatus,
  normalizeAeatConnectionProfile,
};
