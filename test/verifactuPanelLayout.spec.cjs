const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { transformSync } = require("esbuild");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const source = fs.readFileSync(
  path.join(__dirname, "../src/components/admin/VerifactuPanel.jsx"), "utf8",
);
const compiled = transformSync(source, {
  loader: "jsx", format: "cjs", jsx: "automatic",
}).code;
const componentModule = { exports: {} };
vm.runInNewContext(compiled, {
  module: componentModule,
  exports: componentModule.exports,
  require: (name) => name.endsWith("services/invoiceService") ? {} : name === "./VerifactuDocuments" ? () => null : require(name),
});
const Panel = componentModule.exports.default;

for (const channel of ["cloud_certificate", "local_connector", "delegated", "disabled"]) {
  test(`separa guardar configuración de la cola AEAT: ${channel}`, () => {
    const html = renderToStaticMarkup(React.createElement(Panel, {
      companyId: "test-company", invoices: [],
      billingSettings: { verifactuEnabled: true, aeatConnection: { channel } },
    }));
    const configuration = html.match(/<section aria-label="Configuración y conexión"[^>]*>(.*?)<\/section>/s)?.[1];
    const queue = html.match(/<section aria-label="Cola AEAT"[^>]*>(.*?)<\/section>/s)?.[1];
    assert.ok(configuration);
    assert.ok(queue);
    assert.match(configuration, /Guardar configuración/);
    assert.match(configuration, /No envía facturas a la AEAT/);
    assert.doesNotMatch(configuration, /Preparar pendientes|Anular registro|Subsanar registro/);
    assert.match(queue, /Preparar pendientes/);
    assert.match(queue, /Anular registro/);
    assert.match(queue, /Subsanar registro/);
    assert.doesNotMatch(queue, /Guardar configuración/);
    assert.doesNotMatch(html, /Guardar VeriFactu|<option value="production"/);
    assert.match(html, /La producción permanece bloqueada/);
  });
}
