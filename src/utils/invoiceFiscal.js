export const INVOICE_TYPES = {
  F1: "Factura completa",
  F2: "Factura simplificada",
  F3: "Sustitutiva de factura simplificada",
  R1: "Rectificativa por error fundado o art. 80.1, 2 y 6",
  R2: "Rectificativa por concurso",
  R3: "Rectificativa por crédito incobrable",
  R4: "Rectificativa por otras causas",
  R5: "Rectificativa de factura simplificada",
};

export const TAX_TREATMENTS = {
  taxable: "Sujeta y no exenta",
  exempt: "Exenta",
  non_subject: "No sujeta",
};

export const EXEMPTION_CAUSES = {
  E1: "Exenta por artículo 20 LIVA",
  E2: "Exenta por artículo 21 LIVA",
  E3: "Exenta por artículo 22 LIVA",
  E4: "Exenta por artículos 23 y 24 LIVA",
  E5: "Exenta por artículo 25 LIVA",
  E6: "Exenta por otros motivos",
};

const roundMoney = (value) =>
  Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;

export function normalizeFiscalItem(item, defaultTaxRate = 21) {
  const quantity = Number(item.quantity || 0);
  const price = Number(item.price || 0);
  const discountPercent = Math.min(
    100,
    Math.max(0, Number(item.discountPercent || 0)),
  );
  const taxTreatment = item.taxTreatment || "taxable";
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
    ...item,
    description: String(item.description || ""),
    quantity,
    price,
    discountPercent,
    taxTreatment,
    taxRate,
    exemptionCause:
      taxTreatment === "exempt" ? item.exemptionCause || "E1" : "",
    nonSubjectCause:
      taxTreatment === "non_subject"
        ? item.nonSubjectCause || "N1"
        : "",
    surchargeRate,
    taxableBase,
    taxAmount,
    surchargeAmount,
    total: roundMoney(taxableBase + taxAmount + surchargeAmount),
  };
}

export function calculateInvoiceFiscalTotals(items, defaultTaxRate = 21) {
  const normalizedItems = (items || []).map((item) =>
    normalizeFiscalItem(item, defaultTaxRate),
  );
  const breakdownMap = new Map();

  normalizedItems.forEach((item) => {
    const key = [
      item.taxTreatment,
      item.taxRate,
      item.exemptionCause,
      item.nonSubjectCause,
      item.surchargeRate,
    ].join("|");
    const current = breakdownMap.get(key) || {
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
    breakdownMap.set(key, current);
  });

  const taxBreakdown = [...breakdownMap.values()];
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
    taxBreakdown,
    subtotal,
    taxAmount,
    surchargeAmount,
    totalAmount: roundMoney(subtotal + taxAmount + surchargeAmount),
  };
}

export function isRectifyingInvoiceType(invoiceType) {
  return /^R[1-5]$/.test(String(invoiceType || ""));
}
