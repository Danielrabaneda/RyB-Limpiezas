const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("Quote PDF typography", function () {
  const css = fs.readFileSync(
    path.join(__dirname, "../src/pages/admin/QuotesPage.css"),
    "utf8",
  );
  const source = fs.readFileSync(
    path.join(__dirname, "../src/pages/admin/QuotesPage.jsx"),
    "utf8",
  );

  it("muestra el contenido del presupuesto con una tipografia legible", function () {
    assert.match(css, /\.paper\.paper-readable\{[^}]*font-size:14px/);
    assert.match(css, /\.paper\.paper-readable th\{[^}]*font-size:11px/);
    assert.match(css, /\.paper\.paper-readable td>strong\{[^}]*font-size:13px[^}]*font-weight:800/);
    assert.match(css, /\.paper\.paper-readable \.paper-notes>strong\{[^}]*font-size:13px/);
  });

  it("respeta los saltos de linea y usa negro en las descripciones", function () {
    assert.match(source, /className="paper-line-description"/);
    assert.match(css, /\.paper\.paper-readable \.paper-line-description\{[^}]*white-space:pre-line[^}]*color:#111827/);
  });
});
