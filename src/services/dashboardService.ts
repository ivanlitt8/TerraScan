import {
  authenticatedFetch,
  BACKEND_BASE_URL,
  parseBackendError,
} from "./apiService";

const DASHBOARD_ENDPOINT = `${BACKEND_BASE_URL}/api/analisis/dashboard`;

/** Métricas de cabecera (KPIs) del dashboard gerencial. */
export interface DashboardKpis {
  totalLotes: number;
  totalHectareas: number;
  lotesConRiesgoHidrico: number;
  lotesConIncendiosRecientes: number;
}

/** Fila de la matriz de riesgo hídrico (espeja la caché GEE local). */
export interface MatrizRiesgoHidricoItem {
  id: string;
  nombre: string;
  areaHectareas: number;
  /** Elevación media (m s.n.m.) o `null` si el lote no tiene análisis aún. */
  elevacionMedia: number | null;
  totalEventosInundacion: number;
}

/** Foco de incendio simplificado para el monitor del dashboard. */
export interface MonitorIncendioItem {
  loteId: string;
  nombreLote: string;
  fecha: string;
  hora: string | null;
  confianza: string | null;
}

/** Respuesta del endpoint agregador `GET /api/analisis/dashboard`. */
export interface DashboardResponse {
  kpis: DashboardKpis;
  matrizRiesgoHidrico: MatrizRiesgoHidricoItem[];
  monitorIncendios: MonitorIncendioItem[];
}

/**
 * Cliente → backend NestJS (`GET /api/analisis/dashboard`).
 *
 * Devuelve KPIs + matriz hídrica + monitor de incendios del usuario
 * autenticado, calculados con datos locales (DB + caché GEE + PostGIS).
 * Propaga `ApiServiceError` (incluido 401) para que la UI decida el redirect.
 */
export async function fetchDashboard(): Promise<DashboardResponse> {
  const response = await authenticatedFetch(DASHBOARD_ENDPOINT, {
    method: "GET",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo cargar el dashboard.",
    );
    console.error("[fetchDashboard] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  return response.json() as Promise<DashboardResponse>;
}
