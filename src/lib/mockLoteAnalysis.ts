import type { NdviCampania } from "@/types/loteAnalysis";

/**
 * Datos históricos simulados (NDVI + alertas + score) que el backend
 * todavía no calcula. Se combinan con la respuesta real de
 * `POST /api/lotes/analyze` (que ya provee `id`, `nombre`, `areaHectareas`
 * y `createdAt`) hasta que se integre Sentinel Hub / NASA FIRMS.
 */
export type HistoricalAnalysisExtras = {
  scoreSalud: number;
  alertas: import("@/types/loteAnalysis").AlertaHistorica[];
  ndviSerie: NdviCampania[];
};

function buildNdviSerie(): NdviCampania[] {
  return [
    { anio: 2017, ndvi: 0.64, estado: "Normal" },
    { anio: 2018, ndvi: 0.61, estado: "Normal" },
    { anio: 2019, ndvi: 0.38, estado: "Sequía" },
    { anio: 2020, ndvi: 0.55, estado: "Normal" },
    { anio: 2021, ndvi: 0.59, estado: "Normal" },
    { anio: 2022, ndvi: 0.42, estado: "Sequía" },
    { anio: 2023, ndvi: 0.67, estado: "Normal" },
    { anio: 2024, ndvi: 0.63, estado: "Normal" },
  ];
}

/**
 * Mock de la parte histórica del análisis (Región Pampeana).
 *
 * Provisional hasta que el backend devuelva NDVI/alertas reales en
 * `dataProcesada` (ver pendientes en `back/HISTORIAL.md`).
 */
export function buildMockHistoricalAnalysis(): HistoricalAnalysisExtras {
  const ndviSerie = buildNdviSerie();
  const ndviPromedio =
    ndviSerie.reduce((sum, c) => sum + c.ndvi, 0) / ndviSerie.length;
  const sequiaCount = ndviSerie.filter((c) => c.estado === "Sequía").length;

  const scoreSalud = Math.round(
    Math.min(100, Math.max(35, ndviPromedio * 100 - sequiaCount * 8 + 18)),
  );

  return {
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
  };
}
