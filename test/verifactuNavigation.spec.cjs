const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const pageSource = fs.readFileSync(
  path.join(__dirname, "../src/pages/admin/InvoicesPage.jsx"),
  "utf8",
);

test("facturación ofrece un acceso directo al módulo VeriFactu de pruebas", () => {
  assert.match(pageSource, /onClick=\{\(\) => setActiveTab\("verifactu"\)\}/);
  assert.match(pageSource, /VeriFactu · Pruebas/);
  assert.match(pageSource, /activeTab === "verifactu"/);
});

test("VeriFactu ya no está dentro del formulario de ajustes", () => {
  const settingsStart = pageSource.indexOf('activeTab === "settings"');
  const invoiceTableStart = pageSource.indexOf("/* Invoices Table View */");
  const settingsSection = pageSource.slice(settingsStart, invoiceTableStart);

  assert.equal((settingsSection.match(/<VerifactuPanel/g) || []).length, 1);
  assert.ok(
    settingsSection.indexOf('<VerifactuPanel') <
      settingsSection.indexOf('activeTab === "settings"', 1),
  );
});
