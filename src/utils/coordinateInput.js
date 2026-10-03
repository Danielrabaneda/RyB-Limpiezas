export function parseCoordinateInput(value, maxAbs = 180) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;

  const coordinate = Number(normalized);
  if (!Number.isFinite(coordinate) || Math.abs(coordinate) > maxAbs) return null;
  return coordinate;
}

export function parseCoordinatePair(value) {
  const text = String(value ?? "")
    .normalize("NFKC")
    .replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, "")
    .replace(/[\u2212\u2012-\u2014]/g, "-")
    .trim();
  if (!text) return null;

  const mapUrlMatch = text.match(
    /@([+-]?\d{1,2}(?:\.\d+)?),([+-]?\d{1,3}(?:\.\d+)?)(?=,|\/|$)/,
  );
  const parts = mapUrlMatch
    ? [mapUrlMatch[1], mapUrlMatch[2]]
    : text.match(/[+-]?\d{1,3}(?:[.,]\d+)?/g) || [];
  if (parts.length !== 2) return null;

  const lat = parseCoordinateInput(parts[0], 90);
  const lng = parseCoordinateInput(parts[1], 180);
  if (lat === null || lng === null) return null;

  return {
    lat: String(parts[0]).trim().replace(",", "."),
    lng: String(parts[1]).trim().replace(",", "."),
  };
}

export function getCoordinateFormPatch(field, value) {
  return parseCoordinatePair(value) || { [field]: value };
}
