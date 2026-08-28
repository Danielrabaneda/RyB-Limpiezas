const crypto = require("crypto");

const MADRID_TIME_ZONE = "Europe/Madrid";
const FISCAL_SCHEMA_VERSION = "verifactu-pre-aeat-v1";
const SYSTEM_VERSION = "0.1.0-phase2";
const INVOICE_TYPES = new Set([
  "F1",
  "F2",
  "F3",
  "R1",
  "R2",
  "R3",
  "R4",
  "R5",
]);
const TAX_TREATMENTS = new Set(["taxable", "exempt", "non_subject"]);

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function getMadridParts(date = new Date()) {
  const normalizedDate =
    date && typeof date.toDate === "function" ? date.toDate() : date;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: MADRID_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
    timeZoneName: "longOffset",
  }).formatToParts(normalizedDate);

  return Object.fromEntries(parts.map(({ type, value }) => [type, value]));
}

function formatIssueDateForHash(date = new Date()) {
  const parts = getMadridParts(date);
  return `${parts.day}-${parts.month}-${parts.year}`;
}

function getMadridIsoTimestamp(date = new Date()) {
  const parts = getMadridParts(date);
  const offset = String(parts.timeZoneName || "GMT+00:00").replace("GMT", "");
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

function getIssueDate(settings = {}, now = new Date()) {
  if (settings.issueDateMode === "custom" && settings.customIssueDate) {
    // Noon UTC preserves the selected calendar date in Europe/Madrid.
    return new Date(`${settings.customIssueDate}T12:00:00.000Z`);
  }
  return now;
}

function formatInvoiceNumber(settings, invoice, sequence, series = "") {
  const normalizedSeries = String(series || "").trim().toUpperCase();
  if (normalizedSeries) {
    const year = Number(invoice.year) || getMadridParts().year;
    return `${normalizedSeries}-${year}-${String(sequence).padStart(4, "0")}`;
  }
  if ((settings.invoiceNumberFormat || "numeric") === "formatted") {
    const year = Number(invoice.year) || getMadridParts().year;
    return `F-${year}-${String(sequence).padStart(4, "0")}`;
  }
  return String(sequence);
}

function resolveInvoiceType(invoice = {}) {
  const requestedType = String(
    invoice.invoiceType ||
      invoice.rectification?.invoiceType ||
      (invoice.rectifiesInvoiceId ? "R1" : invoice.isSimplified ? "F2" : "F1"),
  ).toUpperCase();
  return INVOICE_TYPES.has(requestedType) ? requestedType : "F1";
}

function resolveInvoiceSeries(settings = {}, invoice = {}) {
  const verifactuTestMode =
    settings.verifactuEnabled === true &&
    settings.aeatConnection?.environment !== "production";
  if (verifactuTestMode) {
    return String(settings.verifactuTestSeries || "TEST-VF")
      .trim()
      .toUpperCase()
      .slice(0, 20);
  }
  const invoiceType = resolveInvoiceType(invoice);
  const requested = String(invoice.series || "").trim().toUpperCase();
  if (requested) return requested.slice(0, 20);
  if (invoiceType.startsWith("R")) {
    return String(settings.rectifyingInvoiceSeries || "R")
      .trim()
      .toUpperCase()
      .slice(0, 20);
  }
  return String(settings.defaultInvoiceSeries || "").trim().toUpperCase().slice(0, 20);
}

function normalizeFiscalItem(item = {}, defaultTaxRate = 21) {
  const quantity = Number(item.quantity || 0);
  const price = Number(item.price || 0);
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(item.discountPercent || 0)),
  );
  const requestedTreatment = String(item.taxTreatment || "taxable");
  const taxTreatment = TAX_TREATMENTS.has(requestedTreatment)
    ? requestedTreatment
    : "taxable";
  const taxRate =
    taxTreatment === "taxable"
      ? Math.max(0, Number(item.taxRate ?? defaultTaxRate))
      : 0;
  const surchargeRate =
    taxTreatment === "taxable"
      ? Math.max(0, Number(item.surchargeRate || 0))
      : 0;
  const taxableBase = roundMoney(
    quantity * price * (1 - discountPercent / 100),
  );
  const taxAmount = roundMoney(taxableBase * (taxRate / 100));
  const surchargeAmount = roundMoney(taxableBase * (surchargeRate / 100));

  return {
    description: String(item.description || ""),
    quantity,
    price,
    discountPercent,
    taxTreatment,
    taxRate,
    exemptionCause:
      taxTreatment === "exempt"
        ? String(item.exemptionCause || "E1").toUpperCase()
        : "",
    nonSubjectCause:
      taxTreatment === "non_subject"
        ? String(item.nonSubjectCause || "N1").toUpperCase()
        : "",
    surchargeRate,
    taxableBase,
    taxAmount,
    surchargeAmount,
    total: roundMoney(taxableBase + taxAmount + surchargeAmount),
  };
}

function calculateInvoiceFiscalTotals(items = [], defaultTaxRate = 21) {
  const normalizedItems = items.map((item) =>
    normalizeFiscalItem(item, defaultTaxRate),
  );
  const breakdown = new Map();
  normalizedItems.forEach((item) => {
    const key = [
      item.taxTreatment,
      item.taxRate,
      item.exemptionCause,
      item.nonSubjectCause,
      item.surchargeRate,
    ].join("|");
    const current = breakdown.get(key) || {
      taxTreatment: item.taxTreatment,
      taxRate: item.taxRate,
      exemptionCause: item.exemptionCause,
      nonSubjectCause: item.nonSubjectCause,
      surchargeRate: item.surchargeRate,
      taxableBase: 0,
      taxAmount: 0,
      surchargeAmount: 0,
    };
    current.taxableBase = roundMoney(
      current.taxableBase + item.taxableBase,
    );
    current.taxAmount = roundMoney(current.taxAmount + item.taxAmount);
    current.surchargeAmount = roundMoney(
      current.surchargeAmount + item.surchargeAmount,
    );
    breakdown.set(key, current);
  });
  const subtotal = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.taxableBase, 0),
  );
  const taxAmount = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.taxAmount, 0),
  );
  const surchargeAmount = roundMoney(
    normalizedItems.reduce((sum, item) => sum + item.surchargeAmount, 0),
  );
  return {
    items: normalizedItems,
    taxBreakdown: [...breakdown.values()],
    subtotal,
    taxAmount,
    surchargeAmount,
    totalAmount: roundMoney(subtotal + taxAmount + surchargeAmount),
  };
}

function computeInvoiceHash({
  idEmisorFactura,
  numSerieFactura,
  fechaExpedicionFactura,
  tipoFactura,
  cuotaTotal,
  importeTotal,
  huellaAnterior,
  fechaHoraHusoGenRegistro,
}) {
  const normalizedIssuerNif = String(idEmisorFactura || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const chain =
    `IDEmisorFactura=${normalizedIssuerNif}` +
    `&NumSerieFactura=${numSerieFactura}` +
    `&FechaExpedicionFactura=${fechaExpedicionFactura}` +
    `&TipoFactura=${tipoFactura}` +
    `&CuotaTotal=${cuotaTotal}` +
    `&ImporteTotal=${importeTotal}` +
    `&Huella=${huellaAnterior || ""}` +
    `&FechaHoraHusoGenRegistro=${fechaHoraHusoGenRegistro}`;

  return crypto.createHash("sha256").update(chain, "utf8").digest("hex").toUpperCase();
}

function computeCancellationHash({
  issuerNif,
  invoiceNumber,
  issueDate,
  previousHash,
  generationTimestamp,
}) {
  const normalizedIssuerNif = String(issuerNif || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const chain =
    `IDEmisorFacturaAnulada=${normalizedIssuerNif}` +
    `&NumSerieFacturaAnulada=${invoiceNumber}` +
    `&FechaExpedicionFacturaAnulada=${issueDate}` +
    `&Huella=${previousHash || ""}` +
    `&FechaHoraHusoGenRegistro=${generationTimestamp}`;
  return crypto.createHash("sha256").update(chain, "utf8").digest("hex").toUpperCase();
}

function buildFiscalRecord({
  companyId,
  invoiceId,
  invoice,
  invoiceNumber,
  invoiceSequence,
  issuerNif,
  previousHash,
  previousFiscalRecordId,
  generationTimestamp,
  hash,
  issueDate,
  createdBy,
}) {
  const invoiceType = resolveInvoiceType(invoice);

  return {
    schemaVersion: FISCAL_SCHEMA_VERSION,
    system: {
      name: "RyB App",
      version: SYSTEM_VERSION,
      producer: "Limpiezas Rayba S.L",
    },
    companyId,
    invoiceId,
    recordType: "alta",
    invoiceType,
    series: String(invoice.series || ""),
    issuerNif,
    invoiceNumber,
    invoiceSequence,
    issueDate,
    fechaExpedicionFactura: formatIssueDateForHash(issueDate),
    fechaHoraHusoGenRegistro: generationTimestamp,
    subtotal: Number(invoice.subtotal || 0),
    taxRate: Number(invoice.taxRate || 0),
    taxAmount: Number(invoice.taxAmount || 0),
    surchargeAmount: Number(invoice.surchargeAmount || 0),
    totalAmount: Number(invoice.totalAmount || 0),
    taxBreakdown: Array.isArray(invoice.taxBreakdown)
      ? invoice.taxBreakdown
      : [],
    operationDate: invoice.operationDate || null,
    client: {
      name: String(invoice.client?.name || ""),
      taxId: String(invoice.client?.cif || ""),
      address: String(invoice.client?.billingAddress || ""),
      idType: String(invoice.client?.idType || "NIF"),
      countryCode: String(invoice.client?.countryCode || "ES"),
    },
    items: Array.isArray(invoice.items)
      ? invoice.items.map((item) => ({
          description: String(item.description || ""),
          quantity: Number(item.quantity || 0),
          price: Number(item.price || 0),
          total: Number(item.total || 0),
          discountPercent: Number(item.discountPercent || 0),
          taxTreatment: String(item.taxTreatment || "taxable"),
          taxRate: Number(item.taxRate || 0),
          exemptionCause: String(item.exemptionCause || ""),
          nonSubjectCause: String(item.nonSubjectCause || ""),
          surchargeRate: Number(item.surchargeRate || 0),
          taxableBase: Number(item.taxableBase || item.total || 0),
          taxAmount: Number(item.taxAmount || 0),
          surchargeAmount: Number(item.surchargeAmount || 0),
        }))
      : [],
    rectifiesInvoiceId: invoice.rectifiesInvoiceId || null,
    rectifiesInvoiceNumber: invoice.rectifiesInvoiceNumber || null,
    rectification: invoice.rectification || null,
    chain: {
      previousFiscalRecordId: previousFiscalRecordId || null,
      previousHash: previousHash || "",
      hash,
      algorithm: "SHA-256",
    },
    fiscalStatus: "generated",
    aeatStatus: "not_connected",
    aeatSubmissionEnabled: false,
    environment: "test",
    createdBy,
  };
}

module.exports = {
  FISCAL_SCHEMA_VERSION,
  SYSTEM_VERSION,
  buildFiscalRecord,
  calculateInvoiceFiscalTotals,
  computeCancellationHash,
  computeInvoiceHash,
  formatInvoiceNumber,
  formatIssueDateForHash,
  getIssueDate,
  getMadridIsoTimestamp,
  normalizeFiscalItem,
  resolveInvoiceSeries,
  resolveInvoiceType,
};
