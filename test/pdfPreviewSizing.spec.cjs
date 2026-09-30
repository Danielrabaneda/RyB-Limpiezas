const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

describe("PDF preview sizing", function () {
  it("reduce la hoja completa al ancho disponible", async function () {
    const { PDF_PREVIEW_WIDTH, calculatePdfPreviewScale } = await import("../src/utils/pdfPreviewSizing.js");

    assert.equal(calculatePdfPreviewScale(PDF_PREVIEW_WIDTH), 1);
    assert.equal(calculatePdfPreviewScale(PDF_PREVIEW_WIDTH / 2), 0.5);
    assert.equal(calculatePdfPreviewScale(PDF_PREVIEW_WIDTH * 2), 1);
  });

  it("conserva el ancho real en la descarga aunque la vista este escalada", async function () {
    const { PDF_PREVIEW_WIDTH, resolvePdfRenderWidth } = await import("../src/utils/pdfPreviewSizing.js");

    assert.equal(resolvePdfRenderWidth(PDF_PREVIEW_WIDTH, 340), PDF_PREVIEW_WIDTH);
    assert.equal(resolvePdfRenderWidth(0, 520), 520);
    assert.equal(resolvePdfRenderWidth(0, 0), PDF_PREVIEW_WIDTH);
  });

  it("duplica el bloque corporativo del presupuesto sin ampliar el titulo", function () {
    const css = fs.readFileSync(
      path.join(__dirname, "../src/pages/admin/QuotesPage.css"),
      "utf8",
    );

    assert.match(css, /\.paper \.paper-company\{[^}]*grid-template-columns:216px/);
    assert.match(css, /\.paper \.paper-company img\{[^}]*width:216px/);
    assert.match(css, /\.paper \.paper-company>strong\{[^}]*font-size:18px/);
    assert.match(css, /\.paper \.paper-company small\{[^}]*font-size:14px/);
    assert.match(css, /\.paper \.paper-company-contact\{[^}]*font-size:14px/);
    assert.doesNotMatch(css, /\.paper-head h2\{[^}]*font-size:40px/);
    assert.ok(
      css.lastIndexOf(".paper .paper-company img{width:216px") >
        css.lastIndexOf(".paper .paper-company img{width:108px"),
      "el tamaño ampliado debe prevalecer en la cascada",
    );
  });
});
