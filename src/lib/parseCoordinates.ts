export type ParsedCoordinates = {
  lat: number;
  lng: number;
};

function parseSignedDecimal(value: string, letter?: string): number | null {
  const normalized = value.replace(",", ".").trim();
  const num = Number.parseFloat(normalized);
  if (Number.isNaN(num)) return null;

  const axis = letter?.toUpperCase();
  if (axis === "S" || axis === "W") return -Math.abs(num);
  if (axis === "N" || axis === "E") return Math.abs(num);
  return num;
}

function isValidLatLng(lat: number, lng: number): boolean {
  return (
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
  );
}

/**
 * Interpreta coordenadas pegadas o escritas a mano.
 * Ej: -34.6, -60.0 · -34.6 -60.0 · 34.6°S 60.0°W
 */
export function parseCoordinates(input: string): ParsedCoordinates | null {
  const trimmed = input.trim().replace(/\s+/g, " ");
  if (!trimmed) return null;

  const decimalPair =
    /^(-?\d{1,2}(?:[.,]\d+)?)\s*[,;]\s*(-?\d{1,3}(?:[.,]\d+)?)$/;
  const spacePair = /^(-?\d{1,2}(?:[.,]\d+)?)\s+(-?\d{1,3}(?:[.,]\d+)?)$/;

  let lat: number | null = null;
  let lng: number | null = null;

  const decimalMatch = trimmed.match(decimalPair);
  if (decimalMatch) {
    lat = parseSignedDecimal(decimalMatch[1]);
    lng = parseSignedDecimal(decimalMatch[2]);
  } else {
    const spaceMatch = trimmed.match(spacePair);
    if (spaceMatch) {
      lat = parseSignedDecimal(spaceMatch[1]);
      lng = parseSignedDecimal(spaceMatch[2]);
    }
  }

  if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
    return { lat, lng };
  }

  const cardinalPair =
    /^(\d{1,2}(?:[.,]\d+)?)\s*°?\s*([NnSs])\s*[,;\s]\s*(\d{1,3}(?:[.,]\d+)?)\s*°?\s*([EeWw])$/i;
  const cardinalMatch = trimmed.match(cardinalPair);
  if (cardinalMatch) {
    lat = parseSignedDecimal(cardinalMatch[1], cardinalMatch[2]);
    lng = parseSignedDecimal(cardinalMatch[3], cardinalMatch[4]);
    if (lat !== null && lng !== null && isValidLatLng(lat, lng)) {
      return { lat, lng };
    }
  }

  return null;
}
