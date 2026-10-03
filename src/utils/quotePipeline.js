const STAGES_BY_QUOTE_STATUS = {
  sent: ["quote_sent", 60],
  viewed: ["negotiation", 75],
  accepted: ["won", 100],
  rejected: ["lost", 0],
  expired: ["lost", 0],
  converted_service: ["won", 100],
  converted_invoice: ["won", 100],
};

export function getQuoteOpportunityStage(status) {
  const match = STAGES_BY_QUOTE_STATUS[status];
  return match ? { stage: match[0], probability: match[1] } : null;
}

export function buildQuoteOpportunityData(quote, status) {
  const stage = getQuoteOpportunityStage(status);
  if (!stage) return null;
  const clientName = String(quote.clientName || "").trim();
  const serviceName = String(quote.title || "").trim() || "Servicio de limpieza";
  return {
    name: `${clientName || "Contacto por asignar"} - ${serviceName}`,
    clientId: quote.clientId || "",
    clientName,
    clientAddress: quote.clientAddress || "",
    contactName: clientName,
    email: quote.clientEmail || "",
    phone: quote.clientPhone || "",
    zone: quote.clientAddress || "",
    serviceType: quote.serviceType || "communities",
    estimatedValue: Number(quote.total || 0),
    expectedCloseDate: quote.validUntil || "",
    owner: quote.owner || "",
    origin: "Presupuesto",
    priority: "medium",
    ...stage,
  };
}
