import html2canvas from "html2canvas";
import jsPDF from "jspdf";
import { resolvePdfRenderWidth } from "./pdfPreviewSizing";
import { copyComputedStyles } from "./pdfRenderStyles";

export async function renderQuotePdf(source, { filename, download = true } = {}) {
  if (!source) throw new Error("No se ha podido preparar la vista del presupuesto.");
  await document.fonts?.ready;
  const sourceWidth = resolvePdfRenderWidth(source.offsetWidth, source.getBoundingClientRect().width);
  const renderHost = document.createElement("div");
  renderHost.className = "pdf-render-host";
  const renderedPreview = source.cloneNode(true);
  // html2canvas snapshots a second document. Inline the visible preview's
  // computed styles so its layout survives that snapshot.
  copyComputedStyles(source, renderedPreview);
  renderedPreview.style.width = `${sourceWidth}px`;
  renderedPreview.style.boxShadow = "none";
  renderHost.appendChild(renderedPreview);
  document.body.appendChild(renderHost);
  try {
    const canvas = await html2canvas(renderedPreview, { backgroundColor: "#ffffff", logging: false, scale: 3, useCORS: true });
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const pageHeightPixels = Math.ceil(canvas.width * pageHeight / pageWidth);
    let offsetY = 0;
    let pageIndex = 0;
    while (offsetY < canvas.height) {
      const remainingHeight = canvas.height - offsetY;
      if (pageIndex > 0 && remainingHeight <= 6) break;
      const sliceHeight = Math.min(pageHeightPixels, remainingHeight);
      const pageCanvas = document.createElement("canvas");
      pageCanvas.width = canvas.width;
      pageCanvas.height = sliceHeight;
      const context = pageCanvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      context.drawImage(canvas, 0, offsetY, canvas.width, sliceHeight, 0, 0, canvas.width, sliceHeight);
      if (pageIndex > 0) pdf.addPage();
      pdf.addImage(pageCanvas.toDataURL("image/png"), "PNG", 0, 0, pageWidth, sliceHeight * pageWidth / canvas.width, undefined, "FAST");
      offsetY += sliceHeight;
      pageIndex += 1;
    }
    if (download) {
      pdf.save(`${filename || "Presupuesto"}.pdf`);
      return null;
    }
    return pdf.output("blob");
  } finally {
    renderHost.remove();
  }
}
