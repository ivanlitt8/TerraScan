import type { Feature, Polygon } from "geojson";

/** Tipos de alerta histórica del lote (MVP). */
export type AlertaTipo = "incendio" | "inundacion";

/** Estado agroclimático de la campaña según NDVI. */
export type NdviEstado = "Sequía" | "Normal";

export type AlertaHistorica = {
  tipo: AlertaTipo;
  /** Fecha ISO (YYYY-MM-DD). */
  fecha: string;
  descripcion: string;
};

export type NdviCampania = {
  /** Año de campaña / serie temporal. */
  anio: number;
  /** Valor NDVI medio del lote (típ. 0–1). */
  ndvi: number;
  estado: NdviEstado;
};

/**
 * Forma exacta de la respuesta del backend NestJS para
 * `POST /api/lotes/analyze` (registro `Lote` de Prisma serializado).
 */
export type LoteBackendResponse = {
  id: string;
  nombre: string;
  areaHectareas: number;
  scoreHistorico: number | null;
  poligonoGeoJSON: Feature<Polygon>;
  dataProcesada: Record<string, unknown>;
  createdAt: string;
  userId: string;
};

/** Body que enviamos al backend al confirmar un lote. */
export type AnalyzeLoteRequestBody = {
  nombre: string;
  poligonoGeoJSON: Feature<Polygon>;
};

/**
 * Modelo que consume la UI (Dashboard).
 *
 * - `id` y `nombre` provienen del backend (Supabase).
 * - `hectareas` y `procesadoEn` también (cálculo geodésico con Turf + `createdAt` de Prisma).
 * - `scoreSalud`, `alertas` y `ndviSerie` siguen siendo simulados en el front
 *   hasta que se integre Sentinel Hub / NASA FIRMS (ver HISTORIAL del back).
 */
export type LoteAnalysisResult = {
  id: string;
  nombre: string;
  hectareas: number;
  /** Score de salud histórica del campo (0–100). */
  scoreSalud: number;
  alertas: AlertaHistorica[];
  /** Últimas 8 campañas. */
  ndviSerie: NdviCampania[];
  /** ISO timestamp del `createdAt` devuelto por el backend. */
  procesadoEn: string;
};
