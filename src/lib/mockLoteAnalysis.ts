import type { Feature, Polygon } from "geojson";
import type { LoteAnalysisResult, NdviCampania } from "@/types/loteAnalysis";

const PROCESSING_DELAY_MS = 2000;

/** Demora simulada de procesamiento satelital (loaders en front). */
export function delayProcessing(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, PROCESSING_DELAY_MS);
  });
}

export function isPolygonFeature(value: unknown): value is Feature<Polygon> {
  if (!value || typeof value !== "object") return false;

  const feature = value as Feature<Polygon>;
  if (feature.type !== "Feature") return false;
  if (!feature.geometry || feature.geometry.type !== "Polygon") return false;

  const ring = feature.geometry.coordinates[0];
  return Array.isArray(ring) && ring.length >= 4;
}

export function parseAnalyzeRequestBody(
  body: unknown,
): Feature<Polygon> | null {
  if (isPolygonFeature(body)) return body;

  if (
    body &&
    typeof body === "object" &&
    "lote" in body &&
    isPolygonFeature((body as { lote: unknown }).lote)
  ) {
    return (body as { lote: Feature<Polygon> }).lote;
  }

  return null;
}

/**
 * Estimación muy simplificada de área (m²) con fórmula del shoelace en grados.
 * Solo para variar el mock según geometría; no usar en producción.
 */
function estimateAreaM2(polygon: Feature<Polygon>): number {
  const ring = polygon.geometry.coordinates[0];
  if (ring.length < 4) return 0;

  let area = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lng1, lat1] = ring[i];
    const [lng2, lat2] = ring[i + 1];
    area += lng1 * lat2 - lng2 * lat1;
  }

  const avgLat =
    ring.reduce((sum, [, lat]) => sum + lat, 0) / (ring.length - 1);
  const latScale = 111_320;
  const lngScale = 111_320 * Math.cos((avgLat * Math.PI) / 180);

  return Math.abs((area / 2) * latScale * lngScale);
}

function buildNdviSerie(): NdviCampania[] {
  const raw: Array<{ anio: number; ndvi: number; estado: NdviCampania["estado"] }> =
    [
      { anio: 2017, ndvi: 0.64, estado: "Normal" },
      { anio: 2018, ndvi: 0.61, estado: "Normal" },
      { anio: 2019, ndvi: 0.38, estado: "Sequía" },
      { anio: 2020, ndvi: 0.55, estado: "Normal" },
      { anio: 2021, ndvi: 0.59, estado: "Normal" },
      { anio: 2022, ndvi: 0.42, estado: "Sequía" },
      { anio: 2023, ndvi: 0.67, estado: "Normal" },
      { anio: 2024, ndvi: 0.63, estado: "Normal" },
    ];

  return raw;
}

/**
 * Mock de análisis histórico — Región Pampeana (campo tipo agrícola/ganadero).
 */
export function buildMockLoteAnalysis(
  lote: Feature<Polygon>,
): LoteAnalysisResult {
  const areaM2 = estimateAreaM2(lote);
  const hectareas =
    areaM2 > 0
      ? Math.round((areaM2 / 10_000) * 10) / 10
      : 218.4;

  const ndviSerie = buildNdviSerie();
  const ndviPromedio =
    ndviSerie.reduce((sum, c) => sum + c.ndvi, 0) / ndviSerie.length;
  const sequiaCount = ndviSerie.filter((c) => c.estado === "Sequía").length;

  const scoreSalud = Math.round(
    Math.min(100, Math.max(35, ndviPromedio * 100 - sequiaCount * 8 + 18)),
  );

  return {
    hectareas,
    scoreSalud,
    alertas: [
      {
        tipo: "inundacion",
        fecha: "2017-04-12",
        descripcion: "Inundación detectada en sector este del lote (SAR).",
      },
      {
        tipo: "incendio",
        fecha: "2019-01-28",
        descripcion: "Foco de calor histórico — NASA FIRMS.",
      },
      {
        tipo: "inundacion",
        fecha: "2022-10-05",
        descripcion: "Evento de anegamiento prolongado tras precipitaciones altas.",
      },
      {
        tipo: "incendio",
        fecha: "2023-02-14",
        descripcion: "Actividad térmica puntual en margen oeste.",
      },
    ],
    ndviSerie,
    procesadoEn: new Date().toISOString(),
  };
}
