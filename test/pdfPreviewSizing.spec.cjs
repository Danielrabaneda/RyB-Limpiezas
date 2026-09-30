const assert = require("node:assert/strict");

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
});
