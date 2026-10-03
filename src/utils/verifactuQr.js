const AEAT_QR_TEST_BASE =
  "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR";
const AEAT_QR_PRODUCTION_BASE =
  "https://www2.agenciatributaria.gob.es/wlpl/TIKE-CONT/ValidarQR";

function normalizeTaxId(value) {
  return String(value || "")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

function formatQrDate(issueDate) {
  if (!issueDate) return "";
  const date = issueDate.toDate ? issueDate.toDate() : new Date(issueDate);
  if (Number.isNaN(date.getTime())) return "";

  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}-${month}-${date.getFullYear()}`;
}

export function isVerifactuInvoice(invoice = {}) {
  return (
    invoice.verifactuEnabledAtEmission === true ||
    String(invoice.emissionMode || "").startsWith("verifactu_")
  );
}

export function buildVerifactuQrUrl(invoice = {}, billingSettings = {}) {
  const production =
    invoice.emissionMode === "verifactu_production" &&
    billingSettings.productionEnabled === true;
  const base = production ? AEAT_QR_PRODUCTION_BASE : AEAT_QR_TEST_BASE;
  const params = new URLSearchParams({
    nif: normalizeTaxId(billingSettings.nif),
    numserie: String(invoice.invoiceNumber || ""),
    fecha: formatQrDate(invoice.issueDate),
    importe: Number(invoice.totalAmount || 0).toFixed(2),
  });

  return `${base}?${params.toString()}`;
}
