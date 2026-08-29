const AEAT_CHANNELS = new Set([
  "disabled",
  "delegated",
  "local_connector",
  "cloud_certificate",
]);
const AEAT_ENVIRONMENTS = new Set(["test"]);
const AEAT_JOB_STATUSES = new Set([
  "awaiting_sender",
  "awaiting_local_connector",
  "awaiting_cloud_sender",
  "processing",
  "accepted",
  "accepted_with_errors",
  "rejected",
  "retry_pending",
]);
const MAX_SUBMISSION_ATTEMPTS = 8;

function getRetryDelayMs(attempts = 0) {
  const safeAttempts = Math.max(0, Math.min(30, Number(attempts) || 0));
  return Math.min(24 * 60 * 60 * 1000, 60 * 1000 * 2 ** safeAttempts);
}

function getNextRetryDate(attempts = 0, now = new Date()) {
  return new Date(now.getTime() + getRetryDelayMs(attempts));
}

function escapeXml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function normalizeTaxId(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function formatAeatDate(value) {
  if (typeof value === "string" && /^\d{2}-\d{2}-\d{4}$/.test(value)) return value;
  const date = value?.toDate ? value.toDate() : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${String(date.getUTCDate()).padStart(2, "0")}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${date.getUTCFullYear()}`;
}

function buildOfficialTaxBreakdownXml(taxBreakdown = []) {
  return taxBreakdown.map((entry) => {
    const treatment = String(entry.taxTreatment || "taxable");
    const classification = treatment === "exempt"
      ? `<sf:OperacionExenta>${escapeXml(entry.exemptionCause || "E1")}</sf:OperacionExenta>`
      : `<sf:CalificacionOperacion>${escapeXml(entry.nonSubjectCause || "S1")}</sf:CalificacionOperacion>`;
    return [
      "<sf:DetalleDesglose>",
      "<sf:Impuesto>01</sf:Impuesto>",
      "<sf:ClaveRegimen>01</sf:ClaveRegimen>",
      classification,
      treatment === "taxable" ? `<sf:TipoImpositivo>${Number(entry.taxRate || 0).toFixed(2)}</sf:TipoImpositivo>` : "",
      `<sf:BaseImponibleOimporteNoSujeto>${Number(entry.taxableBase || 0).toFixed(2)}</sf:BaseImponibleOimporteNoSujeto>`,
      treatment === "taxable" ? `<sf:CuotaRepercutida>${Number(entry.taxAmount || 0).toFixed(2)}</sf:CuotaRepercutida>` : "",
      Number(entry.surchargeRate || 0) ? `<sf:TipoRecargoEquivalencia>${Number(entry.surchargeRate).toFixed(2)}</sf:TipoRecargoEquivalencia>` : "",
      Number(entry.surchargeAmount || 0) ? `<sf:CuotaRecargoEquivalencia>${Number(entry.surchargeAmount).toFixed(2)}</sf:CuotaRecargoEquivalencia>` : "",
      "</sf:DetalleDesglose>",
    ].filter(Boolean).join("");
  }).join("");
}

function buildOfficialChainXml(fiscalRecord, previousFiscalRecord) {
  if (!previousFiscalRecord) return "<sf:PrimerRegistro>S</sf:PrimerRegistro>";
  return [
    "<sf:RegistroAnterior>",
    `<sf:IDEmisorFactura>${escapeXml(normalizeTaxId(previousFiscalRecord.issuerNif))}</sf:IDEmisorFactura>`,
    `<sf:NumSerieFactura>${escapeXml(previousFiscalRecord.invoiceNumber || "")}</sf:NumSerieFactura>`,
    `<sf:FechaExpedicionFactura>${escapeXml(previousFiscalRecord.fechaExpedicionFactura || formatAeatDate(previousFiscalRecord.issueDate))}</sf:FechaExpedicionFactura>`,
    `<sf:Huella>${escapeXml(previousFiscalRecord.chain?.hash || fiscalRecord.chain?.previousHash || "")}</sf:Huella>`,
    "</sf:RegistroAnterior>",
  ].join("");
}

function buildAeatOfficialSoapEnvelope(fiscalRecord, settings = {}, previousFiscalRecord = null) {
  const issuerNif = normalizeTaxId(fiscalRecord.issuerNif || settings.nif);
  const issuerName = String(settings.companyName || fiscalRecord.system?.producer || "").slice(0, 120);
  const invoiceDate = fiscalRecord.fechaExpedicionFactura || formatAeatDate(fiscalRecord.issueDate);
  const chainXml = buildOfficialChainXml(fiscalRecord, previousFiscalRecord);
  const systemName = String(settings.softwareName || "LimpiaGest").slice(0, 30);
  const producerName = String(settings.softwareProducerName || "LIMPIEZAS RAIBA SOCIEDAD LIMITADA").slice(0, 120);
  const producerNif = normalizeTaxId(settings.softwareProducerNif || "B04843843");
  const installation = String(fiscalRecord.companyId || settings.companyId || "tenant").slice(0, 100);
  const systemXml = [
    "<sf:SistemaInformatico>",
    `<sf:NombreRazon>${escapeXml(producerName)}</sf:NombreRazon>`,
    `<sf:NIF>${escapeXml(producerNif)}</sf:NIF>`,
    `<sf:NombreSistemaInformatico>${escapeXml(systemName)}</sf:NombreSistemaInformatico>`,
    "<sf:IdSistemaInformatico>LG</sf:IdSistemaInformatico>",
    "<sf:Version>1.0.0</sf:Version>",
    `<sf:NumeroInstalacion>${escapeXml(installation)}</sf:NumeroInstalacion>`,
    "<sf:TipoUsoPosibleSoloVerifactu>S</sf:TipoUsoPosibleSoloVerifactu>",
    "<sf:TipoUsoPosibleMultiOT>S</sf:TipoUsoPosibleMultiOT>",
    "<sf:IndicadorMultiplesOT>N</sf:IndicadorMultiplesOT>",
    "</sf:SistemaInformatico>",
  ].join("");
  let recordXml;
  if (fiscalRecord.recordType === "anulacion") {
    recordXml = [
      "<sf:RegistroAnulacion>",
      "<sf:IDVersion>1.0</sf:IDVersion>",
      "<sf:IDFactura>",
      `<sf:IDEmisorFacturaAnulada>${escapeXml(issuerNif)}</sf:IDEmisorFacturaAnulada>`,
      `<sf:NumSerieFacturaAnulada>${escapeXml(fiscalRecord.invoiceNumber || "")}</sf:NumSerieFacturaAnulada>`,
      `<sf:FechaExpedicionFacturaAnulada>${escapeXml(invoiceDate)}</sf:FechaExpedicionFacturaAnulada>`,
      "</sf:IDFactura>",
      `<sf:Encadenamiento>${chainXml}</sf:Encadenamiento>`,
      systemXml,
      `<sf:FechaHoraHusoGenRegistro>${escapeXml(fiscalRecord.fechaHoraHusoGenRegistro || "")}</sf:FechaHoraHusoGenRegistro>`,
      "<sf:TipoHuella>01</sf:TipoHuella>",
      `<sf:Huella>${escapeXml(fiscalRecord.chain?.hash || "")}</sf:Huella>`,
      "</sf:RegistroAnulacion>",
    ].join("");
  } else {
    const clientNif = normalizeTaxId(fiscalRecord.client?.taxId);
    const recipients = clientNif ? [
      "<sf:Destinatarios><sf:IDDestinatario>",
      `<sf:NombreRazon>${escapeXml(String(fiscalRecord.client?.name || "").slice(0, 120))}</sf:NombreRazon>`,
      `<sf:NIF>${escapeXml(clientNif)}</sf:NIF>`,
      "</sf:IDDestinatario></sf:Destinatarios>",
    ].join("") : "";
    const description = (fiscalRecord.items || []).map((item) => item.description).filter(Boolean).join("; ").slice(0, 500) || "Prestación de servicios";
    recordXml = [
      "<sf:RegistroAlta>",
      "<sf:IDVersion>1.0</sf:IDVersion>",
      "<sf:IDFactura>",
      `<sf:IDEmisorFactura>${escapeXml(issuerNif)}</sf:IDEmisorFactura>`,
      `<sf:NumSerieFactura>${escapeXml(fiscalRecord.invoiceNumber || "")}</sf:NumSerieFactura>`,
      `<sf:FechaExpedicionFactura>${escapeXml(invoiceDate)}</sf:FechaExpedicionFactura>`,
      "</sf:IDFactura>",
      `<sf:NombreRazonEmisor>${escapeXml(issuerName)}</sf:NombreRazonEmisor>`,
      fiscalRecord.subsanacion === true ||
      ["subsanacion", "alta_subsanacion"].includes(fiscalRecord.recordType)
        ? "<sf:Subsanacion>S</sf:Subsanacion>"
        : "",
      `<sf:TipoFactura>${escapeXml(fiscalRecord.invoiceType || "F1")}</sf:TipoFactura>`,
      `<sf:DescripcionOperacion>${escapeXml(description)}</sf:DescripcionOperacion>`,
      recipients,
      `<sf:Desglose>${buildOfficialTaxBreakdownXml(fiscalRecord.taxBreakdown || [])}</sf:Desglose>`,
      `<sf:CuotaTotal>${Number(fiscalRecord.taxAmount || 0).toFixed(2)}</sf:CuotaTotal>`,
      `<sf:ImporteTotal>${Number(fiscalRecord.totalAmount || 0).toFixed(2)}</sf:ImporteTotal>`,
      `<sf:Encadenamiento>${chainXml}</sf:Encadenamiento>`,
      systemXml,
      `<sf:FechaHoraHusoGenRegistro>${escapeXml(fiscalRecord.fechaHoraHusoGenRegistro || "")}</sf:FechaHoraHusoGenRegistro>`,
      "<sf:TipoHuella>01</sf:TipoHuella>",
      `<sf:Huella>${escapeXml(fiscalRecord.chain?.hash || "")}</sf:Huella>`,
      "</sf:RegistroAlta>",
    ].filter(Boolean).join("");
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/" xmlns:sfLR="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroLR.xsd" xmlns:sf="https://www2.agenciatributaria.gob.es/static_files/common/internet/dep/aplicaciones/es/aeat/tike/cont/ws/SuministroInformacion.xsd">',
    "<soapenv:Header/><soapenv:Body><sfLR:RegFactuSistemaFacturacion>",
    `<sfLR:Cabecera><sf:ObligadoEmision><sf:NombreRazon>${escapeXml(issuerName)}</sf:NombreRazon><sf:NIF>${escapeXml(issuerNif)}</sf:NIF></sf:ObligadoEmision></sfLR:Cabecera>`,
    `<sfLR:RegistroFactura>${recordXml}</sfLR:RegistroFactura>`,
    "</sfLR:RegFactuSistemaFacturacion></soapenv:Body></soapenv:Envelope>",
  ].join("");
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
  if (channel === "cloud_certificate") return "awaiting_cloud_sender";
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
  const fiscalHash = fiscalRecord.chain?.hash || "";
  return {
    format: "ryb-aeat-transport-package",
    version: 1,
    companyId,
    fiscalRecordId,
    invoiceId: fiscalRecord.invoiceId,
    invoiceNumber: fiscalRecord.invoiceNumber,
    recordType: fiscalRecord.recordType,
    issuerNif: fiscalRecord.issuerNif,
    fiscalHash,
    idempotencyKey: `${companyId}:${fiscalRecordId}:${fiscalHash}`,
    channel: profile.channel,
    environment: profile.environment,
    productionEnabled: false,
    schemaValidationStatus: profile.schemaValidationStatus,
  };
}

function isAeatGenerationTimestampFresh(
  generationTimestamp,
  now = new Date(),
  maxSkewMs = 3 * 60 * 1000,
) {
  const generatedAt = new Date(generationTimestamp);
  const reference = now instanceof Date ? now : new Date(now);
  if (
    Number.isNaN(generatedAt.getTime()) ||
    Number.isNaN(reference.getTime())
  ) {
    return false;
  }
  return Math.abs(reference.getTime() - generatedAt.getTime()) <= maxSkewMs;
}

module.exports = {
  AEAT_CHANNELS,
  AEAT_JOB_STATUSES,
  MAX_SUBMISSION_ATTEMPTS,
  buildAeatSubmissionDraftXml,
  buildAeatOfficialSoapEnvelope,
  buildSubmissionManifest,
  escapeXml,
  getInitialSubmissionStatus,
  getNextRetryDate,
  getRetryDelayMs,
  isAeatGenerationTimestampFresh,
  normalizeAeatConnectionProfile,
};
