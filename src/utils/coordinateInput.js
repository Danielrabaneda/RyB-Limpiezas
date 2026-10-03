export function parseCoordinateInput(value, maxAbs = 180) {
  const normalized = String(value ?? "").trim().replace(/\s+/g, "").replace(",", ".");
  if (!normalized) return null;

  const coordinate = Number(normalized);
  if (!Number.isFinite(coordinate) || Math.abs(coordinate) > maxAbs) return null;
  return coordinate;
}

export function parseCoordinatePair(value) {
  const text = String(value ?? "").trim();
  if (!text) return null;

  let parts;
  if (text.includes(";")) {
    parts = text.split(";");
  } else {
    const match = text.match(
      /^([+-]?\d+(?:\.\d+)?)\s*,\s*([+-]?\d+(?:\.\d+)?)$/,
    );
    parts = match ? [match[1], match[2]] : [];
  }
  if (parts.length !== 2) return null;

  const lat = parseCoordinateInput(parts[0], 90);
  const lng = parseCoordinateInput(parts[1], 180);
  if (lat === null || lng === null) return null;

  return {
    lat: String(parts[0]).trim().replace(",", "."),
    lng: String(parts[1]).trim().replace(",", "."),
  };
}
