import type { Feature, Polygon } from "geojson";

/** Tipos de alerta histórica del lote (MVP). */
export type AlertaTipo = "incendio" | "inundacion";

export type AlertaHistorica = {
  tipo: AlertaTipo;
  /** Fecha ISO (YYYY-MM-DD). */
  fecha: string;
  descripcion: string;
  /**
   * Dato agronómico de impacto que la tarjeta muestra de forma prominente
   * (e.g. "16 días de agua", "FRP máx 42.0 MW"). Es el número que el productor
   * debe leer primero; el resto del contexto va en `detalle`.
   */
  impacto?: string;
  /**
   * Detalle secundario y sutil (rango de fechas, satélites, IDs de
   * trazabilidad). Se renderiza en gris menor para no competir con `impacto`.
   */
  detalle?: string;
  /**
   * Etiqueta de la fuente del dato (e.g. "NASA FIRMS", "Global Flood
   * Database"). Si no se especifica, el componente usa un default por tipo.
   * Permite que un dato real declare su origen sin hardcodearlo en la UI.
   */
  fuente?: string;
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

/**
 * Forma de cada elemento devuelto por `GET /api/lotes`.
 *
 * El backend hace un `select` parcial (sin `poligonoGeoJSON` ni `dataProcesada`)
 * para que el listado sea liviano. El polígono se obtiene bajo demanda con
 * `GET /api/lotes/:id` cuando el usuario selecciona un lote en el panel.
 */
export type LoteListItem = {
  id: string;
  nombre: string;
  areaHectareas: number;
  createdAt: string;
};

/** Body que enviamos al backend al confirmar un lote. */
export type AnalyzeLoteRequestBody = {
  nombre: string;
  poligonoGeoJSON: Feature<Polygon>;
};

/**
 * Identidad del lote que consume el Dashboard. Todos los campos provienen
 * del backend real (`POST /api/lotes/analyze`): `id`/`nombre` de Supabase,
 * `hectareas` del cálculo geodésico con Turf y `procesadoEn` del `createdAt`
 * de Prisma.
 *
 * Las métricas (NDVI, score, alertas) NO viven acá: las resuelven hooks
 * dedicados (`useNDVILayer`, `useIncendios`, `useAnalisisEspacial`) contra
 * sus endpoints reales, sin mocks intermedios.
 */
export type LoteAnalysisResult = {
  id: string;
  nombre: string;
  hectareas: number;
  /** ISO timestamp del `createdAt` devuelto por el backend. */
  procesadoEn: string;
};
