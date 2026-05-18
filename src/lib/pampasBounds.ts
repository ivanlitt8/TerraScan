/** Región Pampeana aproximada (MVP_SPEC §4.2). */
export const PAMPAS_BOUNDS = {
  minLat: -41,
  maxLat: -30,
  minLng: -65.5,
  maxLng: -57,
} as const;

export function isInPampas(lat: number, lng: number): boolean {
  return (
    lat >= PAMPAS_BOUNDS.minLat &&
    lat <= PAMPAS_BOUNDS.maxLat &&
    lng >= PAMPAS_BOUNDS.minLng &&
    lng <= PAMPAS_BOUNDS.maxLng
  );
}

/** viewbox para Nominatim: left, top, right, bottom */
export const PAMPAS_VIEWBOX = `${PAMPAS_BOUNDS.minLng},${PAMPAS_BOUNDS.maxLat},${PAMPAS_BOUNDS.maxLng},${PAMPAS_BOUNDS.minLat}`;
