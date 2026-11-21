export const PDF_PREVIEW_WIDTH = 794;
export const PDF_PREVIEW_HEIGHT = PDF_PREVIEW_WIDTH * (297 / 210);

const positiveNumber = (value) => {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export function calculatePdfPreviewScale(availableWidth, paperWidth = PDF_PREVIEW_WIDTH) {
  const width = positiveNumber(availableWidth);
  const documentWidth = positiveNumber(paperWidth) || PDF_PREVIEW_WIDTH;
  return width ? Math.min(1, width / documentWidth) : 1;
}

export function resolvePdfRenderWidth(offsetWidth, renderedWidth, fallbackWidth = PDF_PREVIEW_WIDTH) {
  return Math.round(
    positiveNumber(offsetWidth)
      || positiveNumber(renderedWidth)
      || positiveNumber(fallbackWidth)
      || PDF_PREVIEW_WIDTH,
  );
}
