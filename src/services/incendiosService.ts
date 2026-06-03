/**
 * Cliente HTTP para el módulo de incendios del backend.
 *
 * Espeja `GET /api/lotes/:id/incendios` que devuelve detecciones FIRMS
 * (NOAA-20 + SNPP) intersectando el polígono del lote en un rango
 * temporal. El endpoint está autenticado: usamos `authenticatedFetch`
 * que ya inyecta el `Authorization: Bearer <supabase-access-token>`.
 *
 * Diseño consistente con `lotesService.ts`:
 *  - Tipos planos (no clases) porque son la respuesta y no precisan
 *    validación runtime.
 *  - Mensajes de error tipados con `ApiServiceError` (`status: 401` →
 *    sesión expirada, `502/504` → backend/Sentinel-like errores, `0` →
 *    red local).
 *  - Logging verbose para que durante el desarrollo se vea exactamente
 *    qué URL se llamó y qué se recibió.
 */

import {
  authenticatedFetch,
  BACKEND_BASE_URL,
  parseBackendError,
} from "@/services/apiService";

/**
 * Forma de cada detección FIRMS. **Espeja `IncendioResponse` del backend**
 * (`back/src/modules/incendios/types/incendio.response.ts`).
 *
 * Una detección NO es un incendio: es un píxel térmico de 375 m × 375 m
 * que VIIRS clasificó como fuente de calor en una pasada del satélite.
 * Un mismo incendio puede generar decenas o cientos de detecciones —
 * agrupar por fecha + clustering espacial queda como responsabilidad
 * del consumidor (UI).
 */
export interface IncendioResponse {
  id: number;
  latitude: number;
  longitude: number;
  /** `YYYY-MM-DD` (UTC). */
  fecha: string;
  /** `HHMM` UTC o `null`. */
  hora: string | null;
  /** `"l"` (low), `"n"` (nominal), `"h"` (high) o `null`. */
  confianza: string | null;
  /** Fire Radiative Power en MW. */
  frp: number | null;
  /** Brillo I-4 en Kelvin. */
  brillo: number | null;
  /** Background I-5 en Kelvin. */
  brightT31: number | null;
  /** `"D"` o `"N"`. */
  daynight: string | null;
  /** `"N20"` o `"SNPP"`. */
  satelite: string;
  /** Clasificación FIRMS: 0 veg, 1 volcán, 2 industria, 3 offshore. */
  tipo: number | null;
}

export interface FetchIncendiosOptions {
  /** Fecha inicio ISO 8601 (`YYYY-MM-DD` o completo). Default backend: hace 5 años. */
  from?: string;
  /** Fecha fin ISO 8601. Default backend: hoy. */
  to?: string;
  /** AbortSignal para cancelar el request desde el caller (cleanup de hook). */
  signal?: AbortSignal;
}

/**
 * `GET /api/lotes/:id/incendios` → array de detecciones FIRMS.
 *
 * El backend valida ownership del lote contra el JWT antes de tocar la
 * tabla `incendios`. Si el lote es de otro usuario, devuelve 403.
 *
 * Errores conocidos:
 *  - `401` → sesión expirada, el caller debe redirigir al login.
 *  - `403` → el lote no pertenece al usuario actual.
 *  - `404` → el lote no existe.
 *  - `0`   → fallo de red local (sin Internet, backend caído, etc.).
 *  - `400` → query string mal formado (`from`/`to` no son ISO 8601).
 */
export async function fetchIncendiosByLote(
  loteId: string,
  options: FetchIncendiosOptions = {},
): Promise<IncendioResponse[]> {
  const { from, to, signal } = options;

  const url = new URL(`${BACKEND_BASE_URL}/api/lotes/${loteId}/incendios`);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);

  console.info("[fetchIncendiosByLote] → GET", url.toString());

  const response = await authenticatedFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudieron cargar los incendios del lote.",
    );
    console.error(
      "[fetchIncendiosByLote] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  const data = (await response.json()) as IncendioResponse[];

  console.info(
    "[fetchIncendiosByLote] ← OK",
    `${data.length} detecciones`,
    data,
  );

  return data;
}
