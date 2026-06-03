/**
 * Cliente HTTP de lotes para endpoints que devuelven **binarios** (PNG, etc.).
 *
 * Vive separado de `apiService.ts` para mantener limpio el flujo JSON principal:
 *  - `apiService.ts` parsea cuerpos JSON y los tipa.
 *  - `lotesService.ts` recibe `Blob`s y devuelve `objectURL`s para que el
 *    consumidor (mapa, `<img>`, etc.) los renderice directamente sin pasar
 *    por React-state ni por base64.
 *
 * Diseño de memoria:
 *  - Cada llamada exitosa crea un `ObjectURL` con `URL.createObjectURL(blob)`.
 *  - El navegador NO libera ese URL hasta `URL.revokeObjectURL` explícito.
 *  - El consumidor es responsable de invocar `revokeNDVIObjectURL(url)` cuando
 *    ya no necesite la imagen (típicamente en `cleanup` de `useEffect`).
 *  - El hook `useNDVILayer` cumple este contrato.
 */

import {
  authenticatedFetch,
  BACKEND_BASE_URL,
  parseBackendError,
} from "@/services/apiService";

export type GetSaludNDVIParams = {
  /** UUID v4 del lote, tal cual lo devolvió `analyzeLote` / `fetchLotes`. */
  loteId: string;
  /** Fecha inicial ISO (`YYYY-MM-DD` o ISO 8601). Default backend: hace 30 días. */
  from?: string;
  /** Fecha final ISO (`YYYY-MM-DD` o ISO 8601). Default backend: hoy. */
  to?: string;
  /** Permite cancelar el fetch desde el caller (cleanup de hook). */
  signal?: AbortSignal;
};

/**
 * Bounding box en EPSG:4326 (orden GeoJSON): `[minLng, minLat, maxLng, maxLat]`.
 *
 * Es lo que devuelve el backend en el header `X-NDVI-Bbox` y lo que MapLibre
 * `image` source necesita como input (vía conversión a las 4 esquinas).
 */
export type NDVIBbox = [number, number, number, number];

export interface SaludNDVIResult {
  /**
   * `URL.createObjectURL(blob)` apuntando al PNG NDVI. El consumidor debe
   * `revokeNDVIObjectURL(objectUrl)` cuando deje de usarlo o leakea memoria.
   */
  objectUrl: string;
  /**
   * Bbox exacto que el backend usó para enmarcar el PNG. Viene del header
   * `X-NDVI-Bbox`. Usar **este** valor (no recalcular) garantiza que el
   * `image` source de MapLibre quede alineado píxel-a-píxel con el PNG.
   *
   * `null` solo si el backend no envió el header (versión legacy o proxy
   * que stripee headers custom); el caller debe tener un fallback.
   */
  bbox: NDVIBbox | null;
}

const NDVI_BBOX_HEADER = "X-NDVI-Bbox";

/**
 * Parsea el header `X-NDVI-Bbox` (formato `"minLng,minLat,maxLng,maxLat"`)
 * a una tupla numérica. Tolera espacios extra y valida que sean 4 floats
 * finitos; cualquier desvío devuelve `null` para que el caller pueda caer
 * a un fallback (cálculo local) en vez de explotar.
 */
function parseBboxHeader(raw: string | null): NDVIBbox | null {
  if (!raw) return null;

  const parts = raw.split(",").map((p) => Number.parseFloat(p.trim()));
  if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
    console.warn("[getSaludNDVI] header X-NDVI-Bbox malformado:", raw);
    return null;
  }

  return parts as NDVIBbox;
}

/**
 * `GET /api/lotes/:id/salud` → PNG NDVI + bbox usado para enmarcarlo.
 *
 * Devuelve un `SaludNDVIResult` con:
 *  - `objectUrl`: `URL.createObjectURL(blob)` apuntando al PNG. El consumidor
 *    debe `revokeNDVIObjectURL(url)` cuando deje de usarlo o leakea memoria.
 *  - `bbox`: tupla `[minLng, minLat, maxLng, maxLat]` leída del header
 *    `X-NDVI-Bbox` que envía el backend. Pasarla a MapLibre garantiza
 *    alineamiento píxel a píxel con el PNG (mismo cálculo en ambos lados).
 *    Es `null` si el header no llegó (backend legacy o proxy intermedio); el
 *    caller debe tener un fallback local.
 *
 * Lanza `ApiServiceError` con `status` apropiado si la respuesta no es 200:
 *  - 401 → sesión expirada (la UI debe redirigir al login).
 *  - 502 → Sentinel Hub falló (rate limit, cobertura nubosa, etc.).
 *  - 504 → timeout contra Sentinel.
 *  - 0   → fallo de red local.
 */
export async function getSaludNDVI(
  params: GetSaludNDVIParams,
): Promise<SaludNDVIResult> {
  const { loteId, from, to, signal } = params;

  const url = new URL(`${BACKEND_BASE_URL}/api/lotes/${loteId}/salud`);
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);

  console.info("[getSaludNDVI] → GET", url.toString());

  const response = await authenticatedFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "image/png" },
    signal,
  });

  if (!response.ok) {
    // El backend devuelve JSON en errores (no PNG); `parseBackendError` lo
    // resuelve transparente porque mira `response.json()`.
    const apiError = await parseBackendError(
      response,
      "No se pudo cargar el mapa de salud NDVI.",
    );
    console.error("[getSaludNDVI] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  // Importante: leer headers ANTES de consumir el body. Una vez que llamamos
  // `response.blob()`, el Headers object sigue siendo accesible (el Fetch API
  // los hidrata al recibir el `head`), pero el orden conceptual queda más
  // claro si lo hacemos primero.
  const bbox = parseBboxHeader(response.headers.get(NDVI_BBOX_HEADER));

  // `response.blob()` mantiene el `Content-Type: image/png` que envió el
  // backend (vía `StreamableFile`). MapLibre `image` source acepta cualquier
  // URL renderizable por `<img>` — incluye `blob:` URLs.
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);

  console.info("[getSaludNDVI] ← OK", {
    loteId,
    bytes: blob.size,
    type: blob.type,
    bbox,
    objectUrl,
  });

  if (!bbox) {
    console.warn(
      "[getSaludNDVI] backend no envió X-NDVI-Bbox; el caller debe calcular bbox local",
    );
  }

  return { objectUrl, bbox };
}

/**
 * Punto de la serie temporal NDVI que devuelve `GET /:id/salud-analisis`.
 * Espeja `NDVIStatisticsPoint` del backend pero vive en su propio módulo
 * para no acoplar tipos cross-repo (cuando se mueva a un monorepo con
 * paquete compartido se reemplaza por el import del paquete).
 */
export interface NDVIStatPoint {
  /** Inicio del intervalo agregado (`YYYY-MM-DD`). */
  fecha: string;
  /** NDVI medio del polígono en ese intervalo, [-1, 1]. */
  ndvi: number;
  /**
   * 0–100. % del área medible del lote con NDVI > 0.3 en ese intervalo.
   * Calculado en el backend a partir de la banda `isHealthy` del evalscript
   * (es la `mean` de una banda binaria, no una heurística sobre la media
   * de NDVI), así que penaliza correctamente lotes mosaicados.
   */
  healthScore: number;
  /** Cantidad de píxeles válidos (sampleCount - noDataCount). */
  validPixels: number;
}

/** Etiqueta agronómica del score actual, espeja `HealthScoreCategoria` del backend. */
export type HealthScoreCategoria =
  | "Alta"
  | "Moderada"
  | "Baja"
  | "Sin datos";

/**
 * Resumen del estado de salud del lote a la fecha. Lo devuelve el backend
 * como `healthScore` en el JSON del endpoint compuesto y la UI lo muestra
 * en el bloque "Score de salud" del dashboard reemplazando al mock.
 */
export interface HealthScoreSummary {
  /** 0–100. Score del último intervalo válido de la serie. */
  score: number;
  categoria: HealthScoreCategoria;
  /** Hectáreas geométricas del lote (Turf, independiente de Sentinel). */
  totalHectareas: number;
  /** NDVI medio del intervalo de referencia. `null` si la serie está vacía. */
  ndviPromedio: number | null;
  validPixels: number;
  /** Fecha del intervalo de referencia (`YYYY-MM-DD`). `null` si no hay datos. */
  fechaReferencia: string | null;
}

/**
 * Cuerpo JSON que devuelve `GET /api/lotes/:id/salud-analisis`.
 * Espejado del controller (`LoteController.getSaludAnalisis`).
 */
interface SaludAnalisisBackendResponse {
  imageBase64: string;
  imageMime: string;
  bbox: NDVIBbox;
  stats: NDVIStatPoint[];
  healthScore: HealthScoreSummary;
}

export interface SaludAnalisisResult {
  /**
   * `URL.createObjectURL(blob)` del PNG ya decodificado a Blob a partir
   * del `imageBase64`. El consumidor sigue debiendo `revokeNDVIObjectURL`
   * cuando deja de usarlo, igual que con `getSaludNDVI`.
   */
  objectUrl: string;
  /** Bbox exacto que enmarca el PNG (mismo que viene del backend en el JSON). */
  bbox: NDVIBbox;
  /**
   * Serie temporal NDVI agregada por `P10D` (default backend). Orden
   * cronológico, sin huecos (Sentinel solo emite intervalos con datos).
   */
  stats: NDVIStatPoint[];
  /** Score actual del lote (último intervalo válido) + contexto agronómico. */
  healthScore: HealthScoreSummary;
}

/**
 * Decodifica una string base64 a un `ArrayBuffer` consumible por `Blob`.
 *
 * Nota técnica: devolvemos el `ArrayBuffer` (no `Uint8Array`) para evitar
 * el roce con la discriminación que hace TypeScript ≥ 5.7 entre
 * `ArrayBuffer` y `SharedArrayBuffer` (`new Blob([uint8])` complica el
 * narrowing). Pasarle el buffer crudo al `Blob` es válido y elimina la
 * ambigüedad sin necesidad de casts.
 *
 * Para PNGs de ~30–80 KB la conversión completa demora < 1 ms.
 */
function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const binaryString = atob(b64);
  const len = binaryString.length;
  const buffer = new ArrayBuffer(len);
  const view = new Uint8Array(buffer);
  for (let i = 0; i < len; i += 1) {
    view[i] = binaryString.charCodeAt(i);
  }
  return buffer;
}

/**
 * `GET /api/lotes/:id/salud-analisis` → PNG NDVI + serie temporal estadística.
 *
 * Endpoint compuesto (un solo roundtrip al backend, dos en paralelo a
 * Sentinel Hub). El PNG llega como base64 dentro del JSON; lo convertimos
 * a `Blob` y creamos el `ObjectURL` localmente para que el hook
 * `useNDVILayer` siga teniendo el mismo contrato de memoria que con
 * `getSaludNDVI`.
 *
 * Devuelve `SaludAnalisisResult`:
 *  - `objectUrl`: blob URL del PNG (el consumidor revoca con
 *    `revokeNDVIObjectURL`).
 *  - `bbox`: bbox que enmarca el PNG, ya como tupla numérica (el JSON ya
 *    viene parseado; no hace falta leer header).
 *  - `stats`: array de `{ fecha, ndvi, validPixels }` para alimentar el
 *    gráfico de evolución.
 *
 * Mismos errores que `getSaludNDVI` (401, 502, 504, 0). El backend usa
 * `Promise.all` internamente, así que si una de las dos llamadas a Sentinel
 * falla este endpoint devuelve el error agregado y no hay respuesta parcial.
 */
export async function getSaludAnalisis(
  params: GetSaludNDVIParams,
): Promise<SaludAnalisisResult> {
  const { loteId, from, to, signal } = params;

  const url = new URL(
    `${BACKEND_BASE_URL}/api/lotes/${loteId}/salud-analisis`,
  );
  if (from) url.searchParams.set("from", from);
  if (to) url.searchParams.set("to", to);

  console.info("[getSaludAnalisis] → GET", url.toString());

  const response = await authenticatedFetch(url.toString(), {
    method: "GET",
    headers: { Accept: "application/json" },
    signal,
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo cargar el análisis NDVI del lote.",
    );
    console.error(
      "[getSaludAnalisis] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  const body = (await response.json()) as SaludAnalisisBackendResponse;

  // Reconstruimos el Blob desde el base64. Lo envolvemos en un `try` solo
  // para que un base64 corrupto se transforme en un error de fetch limpio
  // antes de tocar el ObjectURL (no queremos un blob URL apuntando a basura).
  let objectUrl: string;
  try {
    const buffer = base64ToArrayBuffer(body.imageBase64);
    const blob = new Blob([buffer], { type: body.imageMime });
    objectUrl = URL.createObjectURL(blob);
  } catch (cause) {
    console.error("[getSaludAnalisis] ✕ decodificación base64 falló", cause);
    throw new Error("Respuesta del backend con PNG corrupto.");
  }

  console.info("[getSaludAnalisis] ← OK", {
    loteId,
    base64Length: body.imageBase64.length,
    bbox: body.bbox,
    stats: body.stats.length,
    healthScore: body.healthScore.score,
    categoria: body.healthScore.categoria,
    objectUrl,
  });

  return {
    objectUrl,
    bbox: body.bbox,
    stats: body.stats,
    healthScore: body.healthScore,
  };
}

/**
 * Libera el `ObjectURL` creado por `getSaludNDVI`. Es un wrapper trivial
 * sobre `URL.revokeObjectURL` pero queda exportado para que los consumidores
 * no tengan que importar la API nativa y para que el contrato quede explícito
 * en la superficie del servicio.
 *
 * Llamarlo dos veces sobre el mismo URL es seguro (idempotente).
 */
export function revokeNDVIObjectURL(objectUrl: string): void {
  try {
    URL.revokeObjectURL(objectUrl);
  } catch {
    // En navegadores antiguos `revokeObjectURL` puede tirar si el URL no
    // existe. Silenciamos: el efecto deseado (que el browser libere la
    // memoria) ya está cumplido.
  }
}
