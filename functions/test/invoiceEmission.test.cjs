const test = require("node:test");
const assert = require("node:assert/strict");

const {
  buildFiscalRecord,
  calculateInvoiceFiscalTotals,
  computeCancellationHash,
  computeInvoiceHash,
  formatInvoiceNumber,
  formatIssueDateForHash,
  getMadridIsoTimestamp,
  resolveInvoiceSeries,
} = require("../lib/invoiceEmission");

test("computeInvoiceHash genera una huella SHA-256 estable y en mayúsculas", () => {
  const hash = computeInvoiceHash({
    idEmisorFactura: "B04843843",
    numSerieFactura: "F-2026-0001",
    fechaExpedicionFactura: "26-07-2026",
    tipoFactura: "F1",
    cuotaTotal: "21.00",
    importeTotal: "121.00",
    huellaAnterior: "",
    fechaHoraHusoGenRegistro: "2026-07-26T12:30:00+02:00",
  });

  assert.equal(
    hash,
    "EF8FA276CEAB36E9D758CC077007C28B37A6926517D00B0D82C1E1E139E13938",
  );
});

test("computeInvoiceHash normaliza el NIF igual que la AEAT", () => {
  const common = {
    numSerieFactura: "346",
    fechaExpedicionFactura: "31-07-2026",
    tipoFactura: "F1",
    cuotaTotal: "0.21",
    importeTotal: "1.21",
    huellaAnterior: "",
    fechaHoraHusoGenRegistro: "2026-08-27T12:42:15+02:00",
  };

  assert.equal(
    computeInvoiceHash({ ...common, idEmisorFactura: "B-04843843" }),
    computeInvoiceHash({ ...common, idEmisorFactura: "B04843843" }),
  );
  assert.equal(
    computeInvoiceHash({ ...common, idEmisorFactura: "B-04843843" }),
    "89F421C83173E67B4856B3FE0CE2FDB2E7E76C9B60D43561035A4EF20BBE67FE",
  );
});

test("las fechas fiscales usan el huso horario de Madrid", () => {
  assert.equal(
    getMadridIsoTimestamp(new Date("2026-07-26T10:30:00Z")),
    "2026-07-26T12:30:00+02:00",
  );
  assert.equal(
    formatIssueDateForHash(new Date("2026-07-26T22:30:00Z")),
    "27-07-2026",
  );
});

test("formatInvoiceNumber respeta numeración simple y con prefijo", () => {
  assert.equal(formatInvoiceNumber({}, { year: 2026 }, 7), "7");
  assert.equal(
    formatInvoiceNumber(
      { invoiceNumberFormat: "formatted" },
      { year: 2026 },
      7,
    ),
    "F-2026-0007",
  );
  assert.equal(
    formatInvoiceNumber({}, { year: 2026 }, 7, "R"),
    "R-2026-0007",
  );
});

test("VeriFactu de pruebas usa una serie aislada de la numeración real", () => {
  const settings = {
    verifactuEnabled: true,
    verifactuTestSeries: "TEST-VF",
    defaultInvoiceSeries: "REAL",
    aeatConnection: { environment: "test" },
  };

  assert.equal(resolveInvoiceSeries(settings, {}), "TEST-VF");
  assert.equal(resolveInvoiceSeries(settings, { series: "REAL" }), "TEST-VF");
  assert.equal(
    formatInvoiceNumber(settings, { year: 2026 }, 1, "TEST-VF"),
    "TEST-VF-2026-0001",
  );
});

test("la serie real se conserva fuera del entorno de pruebas", () => {
  assert.equal(
    resolveInvoiceSeries(
      {
        verifactuEnabled: true,
        defaultInvoiceSeries: "REAL",
        aeatConnection: { environment: "production" },
      },
      {},
    ),
    "REAL",
  );
});

test("calcula IVA mixto, exención, descuento y recargo por concepto", () => {
  const totals = calculateInvoiceFiscalTotals([
    {
      description: "Servicio general",
      quantity: 2,
      price: 50,
      discountPercent: 10,
      taxTreatment: "taxable",
      taxRate: 21,
      surchargeRate: 5.2,
    },
    {
      description: "Servicio reducido",
      quantity: 1,
      price: 40,
      taxTreatment: "taxable",
      taxRate: 10,
    },
    {
      description: "Operación exenta",
      quantity: 1,
      price: 30,
      taxTreatment: "exempt",
      exemptionCause: "E1",
    },
    {
      description: "Operación no sujeta",
      quantity: 1,
      price: 20,
      taxTreatment: "non_subject",
      nonSubjectCause: "N2",
    },
  ]);

  assert.equal(totals.subtotal, 180);
  assert.equal(totals.taxAmount, 22.9);
  assert.equal(totals.surchargeAmount, 4.68);
  assert.equal(totals.totalAmount, 207.58);
  assert.equal(totals.taxBreakdown.length, 4);
  assert.equal(totals.items[0].taxableBase, 90);
  assert.equal(totals.items[2].taxAmount, 0);
});

test("la anulación genera una huella estable y encadenada", () => {
  const input = {
    issuerNif: "B04843843",
    invoiceNumber: "A-2026-0001",
    issueDate: "26-07-2026",
    previousHash: "ABC",
    generationTimestamp: "2026-07-26T12:30:00+02:00",
  };
  const first = computeCancellationHash(input);
  const second = computeCancellationHash(input);
  const changed = computeCancellationHash({ ...input, previousHash: "DEF" });

  assert.match(first, /^[A-F0-9]{64}$/);
  assert.equal(first, second);
  assert.equal(first, computeCancellationHash({ ...input, issuerNif: "B-04843843" }));
  assert.notEqual(first, changed);
});

test("buildFiscalRecord conserva cadena, datos fiscales y estado no conectado", () => {
  const record = buildFiscalRecord({
    companyId: "rayba",
    invoiceId: "invoice-1",
    invoice: {
      invoiceType: "F1",
      series: "A",
      subtotal: 100,
      taxRate: 21,
      taxAmount: 21,
      totalAmount: 121,
      surchargeAmount: 0,
      taxBreakdown: [
        {
          taxTreatment: "taxable",
          taxRate: 21,
          taxableBase: 100,
          taxAmount: 21,
        },
      ],
      client: {
        name: "Cliente",
        cif: "B12345678",
        idType: "NIF",
        countryCode: "ES",
      },
      items: [
        {
          description: "Servicio",
          quantity: 1,
          price: 100,
          total: 121,
          taxableBase: 100,
          taxTreatment: "taxable",
          taxRate: 21,
          taxAmount: 21,
        },
      ],
    },
    invoiceNumber: "1",
    invoiceSequence: 1,
    issuerNif: "B04843843",
    previousHash: "ABC",
    previousFiscalRecordId: "alta_previous",
    generationTimestamp: "2026-07-26T12:30:00+02:00",
    hash: "DEF",
    issueDate: {
      toDate: () => new Date("2026-07-26T10:30:00Z"),
    },
    createdBy: "admin-1",
  });

  assert.equal(record.recordType, "alta");
  assert.equal(record.chain.previousHash, "ABC");
  assert.equal(record.chain.hash, "DEF");
  assert.equal(record.aeatStatus, "not_connected");
  assert.equal(record.aeatSubmissionEnabled, false);
  assert.equal(record.totalAmount, 121);
  assert.equal(record.series, "A");
  assert.equal(record.client.countryCode, "ES");
  assert.equal(record.items[0].taxableBase, 100);
  assert.equal(record.fechaExpedicionFactura, "26-07-2026");
});
