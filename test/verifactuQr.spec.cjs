const assert = require("node:assert/strict");
const test = require("node:test");

test("el QR de pruebas usa el portal externo oficial y normaliza el NIF", async () => {
  const { buildVerifactuQrUrl } = await import("../src/utils/verifactuQr.js");
  const url = buildVerifactuQrUrl(
    {
      invoiceNumber: "TEST-VF-2026-0001",
      issueDate: new Date(2026, 6, 31),
      totalAmount: 1.21,
      emissionMode: "verifactu_test",
    },
    { nif: "B-04843843", verifactuMode: "test" },
  );

  assert.equal(
    url,
    "https://prewww2.aeat.es/wlpl/TIKE-CONT/ValidarQR?nif=B04843843&numserie=TEST-VF-2026-0001&fecha=31-07-2026&importe=1.21",
  );
});

test("producción solo usa su URL cuando está habilitada explícitamente", async () => {
  const { buildVerifactuQrUrl } = await import("../src/utils/verifactuQr.js");
  const url = buildVerifactuQrUrl(
    {
      invoiceNumber: "F-1",
      issueDate: new Date(2026, 7, 29),
      totalAmount: 10,
      emissionMode: "verifactu_production",
    },
    { nif: "B04843843", productionEnabled: true },
  );

  assert.match(url, /^https:\/\/www2\.agenciatributaria\.gob\.es\//);
});

test("solo las facturas VeriFactu reciben QR tributario", async () => {
  const { isVerifactuInvoice } = await import("../src/utils/verifactuQr.js");

  assert.equal(isVerifactuInvoice({ emissionMode: "verifactu_test" }), true);
  assert.equal(isVerifactuInvoice({ emissionMode: "legacy" }), false);
  assert.equal(isVerifactuInvoice({ status: "pending" }), false);
});
