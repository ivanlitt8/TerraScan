/**
 * Cliente HTTP para el módulo de análisis espacial del backend (GEE).
 *
 * Espeja `GET /api/gee/analisis/:loteId`, que orquesta consultas a Google
 * Earth Engine (elevación media SRTM + historial de inundaciones del Global
 * Flood Database) con caché en DB. El endpoint está autenticado: usamos
 * `authenticatedFetch`, que inyecta el `Authorization: Bearer <token>`.
 *
 * Diseño consistente con `incendiosService.ts`: tipos planos, errores
 * tipados con `ApiServiceError` y logging verbose del request/response.
 */

import {
  authenticatedFetch,
  BACKEND_BASE_URL,
  parseBackendError,
} from "@/services/apiService";

/**
 * Un evento de inundación que afectó al lote (derivado del GFD).
 * **Espeja `FloodEvent` del backend** (`back/src/modules/gee/gee.service.ts`).
 */
export interface FloodEvent {
  /** Fecha de inicio `YYYY-MM-DD` (UTC) o `null`. */
  began: string | null;
  /** Fecha de fin `YYYY-MM-DD` (UTC) o `null`. */
  ended: string | null;
  /** Días entre inicio y fin, o `null`. */
  duracionDias: number | null;
  /** ID original del Dartmouth Flood Observatory, o `null`. */
  dfoId: number | null;
}

/**
 * Descriptor de cada fuente de datos consultada. Contrato extensible: si el
 * backend suma una fuente (e.g. JRC Global Surface Water), aparece un item
 * más en el array sin romper el shape.
 */
export interface FuenteAnalizada {
  dataset: string;
  variable: "elevacion" | "inundaciones";
  periodoCobertura: string;
  resolucionMetros: number;
}

/**
 * Respuesta de `GET /api/gee/analisis/:loteId`.
 * **Espeja `AnalisisLoteResponse` del backend.**
 */
export interface AnalisisEspacialResponse {
  loteId: string;
  /** Elevación media del lote en m s.n.m., o `null` si no hubo cobertura. */
  elevacion: number | null;
  /** Cantidad de eventos de inundación (GFD) que afectaron el lote. */
  eventosInundacion: number;
  /** Detalle de los eventos de inundación. */
  inundaciones: FloodEvent[];
  /** Datasets consultados + cobertura. */
  fuentes_analizadas: FuenteAnalizada[];
  /** `true` si la respuesta salió de la caché del backend (no se consultó GEE). */
  cacheado: boolean;
  /** ISO timestamp del último cálculo persistido. */
  actualizadoEn: string;
}

export interface FetchAnalisisEspacialOptions {
  /** AbortSignal para cancelar el request desde el caller (cleanup de hook). */
  signal?: AbortSignal;
  /**
   * Si es `true`, agrega `?force=true` para que el backend ignore su caché y
   * recalcule contra GEE. Lo usa el botón "Actualizar datos" del panel.
   */
  force?: boolean;
}

/**
 * `GET /api/gee/analisis/:loteId` → análisis espacial consolidado.
 *
 * El backend valida ownership del lote contra el JWT antes de consultar GEE.
 *
 * Errores conocidos:
 *  - `401` → sesión expirada, el caller debe redirigir al login.
 *  - `403` → el lote no pertenece al usuario actual.
 *  - `404` → el lote no existe.
 *  - `503` → GEE no está inicializado en el backend.
 *  - `502/504` → GEE falló o excedió el timeout.
 *  - `0`   → fallo de red local (sin Internet, backend caído, etc.).
 */
export async function fetchAnalisisEspacial(
  loteId: string,
  options: FetchAnalisisEspacialOptions = {},
): Promise<AnalisisEspacialResponse> {
  const { signal, force } = options;

  const url = new URL(`${BACKEND_BASE_URL}/api/gee/analisis/${loteId}`);
  if (force) url.searchParams.set("force", "true");

  console.info("[fetchAnalisisEspacial] → GET", url.toString());

  const response = await authenticatedFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo cargar el análisis espacial del lote.",
    );
    console.error(
      "[fetchAnalisisEspacial] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  const data = (await response.json()) as AnalisisEspacialResponse;

  console.info(
    "[fetchAnalisisEspacial] ← OK",
    `elevación ${data.elevacion ?? "N/D"} m · ${data.eventosInundacion} inundaciones` +
      `${data.cacheado ? " (cacheado)" : ""}`,
    data,
  );

  return data;
}
