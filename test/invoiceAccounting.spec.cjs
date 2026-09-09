const assert = require("node:assert/strict");
const test = require("node:test");

test("las facturas anuladas no suman como facturadas ni pendientes", async () => {
  const { calculateInvoiceSummaryTotals } = await import(
    "../src/utils/invoiceAccounting.js"
  );
  const totals = calculateInvoiceSummaryTotals([
    { status: "pending", totalAmount: 1.21, invoiceStatus: "cancelled" },
    { status: "pending", totalAmount: 1.21, fiscalStatus: "cancelled" },
  ]);

  assert.deepEqual(totals, { facturado: 0, cobrado: 0, pendiente: 0 });
});

test("los totales conservan las facturas pendientes y cobradas activas", async () => {
  const { calculateInvoiceSummaryTotals } = await import(
    "../src/utils/invoiceAccounting.js"
  );
  const totals = calculateInvoiceSummaryTotals([
    { status: "pending", totalAmount: 10 },
    { status: "paid", totalAmount: 20 },
    { status: "draft", totalAmount: 30 },
  ]);

  assert.deepEqual(totals, { facturado: 30, cobrado: 20, pendiente: 10 });
});
