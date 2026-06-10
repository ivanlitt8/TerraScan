import type { Feature, Polygon } from "geojson";

/**
 * Área (en hectáreas) del anillo exterior de un polígono GeoJSON usando la
 * aproximación esférica estándar. Sólo para mostrar contexto en la UI; el
 * valor oficial lo recalcula el backend con Turf.
 */
export function calcularHectareas(polygon: Feature<Polygon> | null): number {
  const ring = polygon?.geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) return 0;

  const R = 6378137; // radio terrestre (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    total +=
      toRad(lon2 - lon1) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  const areaM2 = Math.abs((total * R * R) / 2);
  return areaM2 / 10_000;
}

/* ──────────────────────────────────────────────────────────────────────── */
/* Validación / normalización de GeoJSON subido por el usuario                */
/* ──────────────────────────────────────────────────────────────────────── */

export type ParseGeoJSONResult =
  | { ok: true; feature: Feature<Polygon>; hectareas: number }
  | { ok: false; error: string };

function esParCoordenada(value: unknown): value is [number, number] {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number" &&
    Number.isFinite(value[0]) &&
    Number.isFinite(value[1])
  );
}

/** Un anillo (LinearRing) válido necesita al menos 4 pares de coordenadas. */
function esAnilloValido(ring: unknown): ring is [number, number][] {
  return Array.isArray(ring) && ring.length >= 4 && ring.every(esParCoordenada);
}

function sonCoordsPolygonValidas(coords: unknown): coords is number[][][] {
  return (
    Array.isArray(coords) && coords.length >= 1 && coords.every(esAnilloValido)
  );
}

function featureDesdeCoords(coords: number[][][]): ParseGeoJSONResult {
  const feature: Feature<Polygon> = {
    type: "Feature",
    geometry: { type: "Polygon", coordinates: coords },
    properties: {},
  };
  return { ok: true, feature, hectareas: calcularHectareas(feature) };
}

function extraerDesdeGeometry(geometry: unknown): ParseGeoJSONResult {
  const g = geometry as { type?: string; coordinates?: unknown } | null;
  if (!g || typeof g !== "object") {
    return { ok: false, error: "La geometría del GeoJSON es inválida." };
  }

  if (g.type === "Polygon") {
    if (!sonCoordsPolygonValidas(g.coordinates)) {
      return { ok: false, error: "El polígono no tiene coordenadas válidas." };
    }
    return featureDesdeCoords(g.coordinates);
  }

  if (g.type === "MultiPolygon") {
    const coords = g.coordinates;
    if (!Array.isArray(coords) || coords.length === 0) {
      return { ok: false, error: "El MultiPolygon no contiene polígonos." };
    }
    // Sólo aceptamos lotes de geometría única: un MultiPolygon con varios
    // polígonos representa más de un lote y rompe el flujo de creación.
    if (coords.length > 1) {
      return { ok: false, error: "El GeoJSON debe contener un polígono único." };
    }
    if (!sonCoordsPolygonValidas(coords[0])) {
      return { ok: false, error: "El polígono no tiene coordenadas válidas." };
    }
    return featureDesdeCoords(coords[0]);
  }

  return {
    ok: false,
    error: "La geometría debe ser un Polygon o MultiPolygon.",
  };
}

/**
 * Normaliza un GeoJSON arbitrario (FeatureCollection, Feature o geometría
 * cruda) a un único `Feature<Polygon>` listo para inyectar en el mapa.
 * Devuelve un error legible (nunca lanza) para que la UI lo muestre sin
 * romperse ante archivos malformados o no soportados.
 */
export function parsePolygonGeoJSON(raw: unknown): ParseGeoJSONResult {
  if (!raw || typeof raw !== "object") {
    return { ok: false, error: "El archivo no contiene un GeoJSON válido." };
  }

  const obj = raw as {
    type?: string;
    features?: unknown;
    geometry?: unknown;
  };

  if (obj.type === "FeatureCollection") {
    const features = Array.isArray(obj.features) ? obj.features : [];
    const polygonFeatures = features.filter((f) => {
      const tipo = (f as { geometry?: { type?: string } } | null)?.geometry
        ?.type;
      return tipo === "Polygon" || tipo === "MultiPolygon";
    });

    if (polygonFeatures.length === 0) {
      return { ok: false, error: "El GeoJSON no contiene ningún polígono." };
    }
    if (polygonFeatures.length > 1) {
      return { ok: false, error: "El GeoJSON debe contener un polígono único." };
    }
    return extraerDesdeGeometry(
      (polygonFeatures[0] as { geometry?: unknown }).geometry,
    );
  }

  if (obj.type === "Feature") {
    return extraerDesdeGeometry(obj.geometry);
  }

  if (obj.type === "Polygon" || obj.type === "MultiPolygon") {
    return extraerDesdeGeometry(obj);
  }

  return {
    ok: false,
    error: "Formato GeoJSON no soportado. Debe ser un Feature con un polígono.",
  };
}
