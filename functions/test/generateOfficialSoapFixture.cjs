const { buildAeatOfficialSoapEnvelope } = require("../lib/aeatSubmission");

process.stdout.write(buildAeatOfficialSoapEnvelope({
  companyId: "test-company",
  recordType: "alta",
  invoiceType: "F1",
  issuerNif: "B04843843",
  invoiceNumber: "TEST-2026-0001",
  fechaExpedicionFactura: "20-08-2026",
  fechaHoraHusoGenRegistro: "2026-08-20T12:00:00+02:00",
  taxAmount: 21,
  totalAmount: 121,
  client: { name: "CLIENTE PRUEBAS", taxId: "B12345678" },
  items: [{ description: "Prueba técnica sin valor fiscal" }],
  taxBreakdown: [{ taxTreatment: "taxable", taxRate: 21, taxableBase: 100, taxAmount: 21 }],
  chain: { hash: "A".repeat(64), previousHash: "" },
}, { companyName: "LIMPIEZAS RAIBA SOCIEDAD LIMITADA" }));
