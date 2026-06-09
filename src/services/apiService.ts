import { isInPampas, PAMPAS_VIEWBOX } from "@/lib/pampasBounds";
import type {
  AnalyzeLoteRequestBody,
  LoteBackendResponse,
  LoteListItem,
} from "@/types/loteAnalysis";
import {
  nominatimTypeToPrecision,
  zoomForPrecision,
  type FlyToLocation,
  type LocationPrecision,
} from "@/lib/locationSearch";
import { createClient as createSupabaseBrowserClient } from "@/utils/supabase/client";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "TerrascanMVP/1.0 (geocode; desarrollo local)";

export const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const ANALYZE_LOTE_ENDPOINT = `${BACKEND_BASE_URL}/api/lotes/analyze`;
const LIST_LOTES_ENDPOINT = `${BACKEND_BASE_URL}/api/lotes`;

type ApiErrorBody = {
  error?: string;
  message?: string | string[];
};

type NominatimResult = {
  lat: string;
  lon: string;
  display_name: string;
  type: string;
  class: string;
};

export class ApiServiceError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiServiceError";
    this.status = status;
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  return response.json() as Promise<T>;
}

/**
 * Recupera el `access_token` de la sesión activa de Supabase desde el cliente
 * del navegador.
 *
 * Si no hay sesión (usuario nunca logueado, token expirado y refresh fallido,
 * etc.) lanza un `ApiServiceError` con `status: 401` para que el consumidor
 * pueda diferenciar "fallo de auth" de "fallo de red" o "error del backend".
 */
async function getSupabaseAccessToken(): Promise<string> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    console.error("[auth] ✕ getSession error", error);
    throw new ApiServiceError(
      "No pudimos verificar tu sesión. Iniciá sesión nuevamente.",
      401,
    );
  }

  const token = data.session?.access_token;
  if (!token) {
    throw new ApiServiceError(
      "Sesión no encontrada. Iniciá sesión para continuar.",
      401,
    );
  }

  return token;
}

/**
 * `fetch` autenticado contra el backend NestJS.
 *
 * - Obtiene el `access_token` de Supabase de forma asíncrona ANTES de disparar
 *   la petición (el plugin de auth puede haber refrescado el token entre llamadas).
 * - Inyecta `Authorization: Bearer <access_token>` sin pisar headers que el
 *   caller ya hubiera definido.
 * - Captura errores de red y los normaliza a `ApiServiceError(status: 0)`.
 * - Si recibe `401` del backend, lo propaga como `ApiServiceError` con el
 *   mismo status para que la UI pueda redirigir al login.
 */
export async function authenticatedFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const accessToken = await getSupabaseAccessToken();

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(url, { ...init, headers });
  } catch (cause) {
    console.error("[authenticatedFetch] ✕ network error", url, cause);
    throw new ApiServiceError(
      "No se pudo contactar al backend de Terrascan.",
      0,
    );
  }

  return response;
}

/**
 * Cliente → API interna de Next.js (`/api/geocode`).
 * Usar desde componentes con `"use client"`.
 *
 * No requiere `Authorization`: la ruta vive en el propio Next y sólo es un
 * proxy al servicio público de Nominatim.
 */
export async function searchLocation(query: string): Promise<FlyToLocation> {
  const response = await fetch(
    `/api/geocode?q=${encodeURIComponent(query.trim())}`,
  );

  const data = await parseJson<FlyToLocation & ApiErrorBody>(response);

  if (!response.ok) {
    throw new ApiServiceError(
      data.error ?? "No se pudo buscar la zona.",
      response.status,
    );
  }

  return data;
}

/**
 * Sanitiza el `Feature<Polygon>` que devuelve Mapbox Draw para que matchee
 * exactamente el `PoligonoGeoJSONDto` del backend.
 *
 * Mapbox Draw inyecta un `id` en el Feature (y a veces propiedades internas
 * en `properties`), pero el backend corre `ValidationPipe` con
 * `whitelist: true` + `forbidNonWhitelisted: true` y rechaza cualquier
 * propiedad no declarada (`property id should not exist`).
 *
 * Sólo dejamos pasar `type`, `geometry` (como objeto plano `{ type, coordinates }`)
 * y `properties` (un objeto vacío si no había, para no enviar `undefined`).
 */
function sanitizePoligonoGeoJSON(
  feature: AnalyzeLoteRequestBody["poligonoGeoJSON"],
): AnalyzeLoteRequestBody["poligonoGeoJSON"] {
  return {
    type: "Feature",
    geometry: {
      type: "Polygon",
      coordinates: feature.geometry.coordinates,
    },
    properties: feature.properties ?? {},
  };
}

export async function parseBackendError(
  response: Response,
  fallbackMessage: string,
): Promise<ApiServiceError> {
  const data = await parseJson<ApiErrorBody>(response).catch(
    () => ({}) as ApiErrorBody,
  );

  const message =
    typeof data.message === "string"
      ? data.message
      : Array.isArray(data.message)
        ? data.message.join(" · ")
        : data.error;

  return new ApiServiceError(message ?? fallbackMessage, response.status);
}

/**
 * Cliente → backend NestJS (`POST {NEXT_PUBLIC_API_URL}/api/lotes/analyze`).
 *
 * Persiste el lote en Supabase (vía Prisma) y devuelve la fila completa,
 * incluido el `id` (UUID) y `areaHectareas` calculado con Turf en el server.
 *
 * Requiere sesión Supabase activa: el `access_token` se inyecta como
 * `Authorization: Bearer …` para que el backend (cuando esté listo) pueda
 * resolver el `userId` del JWT.
 */
export async function analyzeLote(
  body: AnalyzeLoteRequestBody,
): Promise<LoteBackendResponse> {
  const payload: AnalyzeLoteRequestBody = {
    nombre: body.nombre,
    poligonoGeoJSON: sanitizePoligonoGeoJSON(body.poligonoGeoJSON),
    // Sólo lo incluimos si hay un establecimiento elegido; el backend lo
    // valida con `@IsUUID` y rechazaría `null`/`""`.
    ...(body.establecimientoId
      ? { establecimientoId: body.establecimientoId }
      : {}),
  };

  console.info("[analyzeLote] → POST", ANALYZE_LOTE_ENDPOINT, {
    nombre: payload.nombre,
    establecimientoId: payload.establecimientoId ?? null,
    vertices: payload.poligonoGeoJSON.geometry.coordinates[0]?.length ?? 0,
  });

  const response = await authenticatedFetch(ANALYZE_LOTE_ENDPOINT, {
    method: "POST",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo analizar el lote.",
    );
    console.error("[analyzeLote] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  const data = await parseJson<LoteBackendResponse>(response);

  console.info("[analyzeLote] ← OK", {
    id: data.id,
    nombre: data.nombre,
    areaHectareas: data.areaHectareas,
    createdAt: data.createdAt,
  });

  return data;
}

/**
 * Cliente → backend NestJS (`GET {NEXT_PUBLIC_API_URL}/api/lotes`).
 *
 * Devuelve los lotes del usuario autenticado. Pensada para el listado "Mis lotes"
 * que aparecerá cuando exista UI para gestionar lotes ya creados.
 */
export async function fetchLotes(): Promise<LoteListItem[]> {
  const response = await authenticatedFetch(LIST_LOTES_ENDPOINT, {
    method: "GET",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudieron obtener los lotes.",
    );
    console.error("[fetchLotes] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  return parseJson<LoteListItem[]>(response);
}

/**
 * Cliente → backend NestJS (`GET {NEXT_PUBLIC_API_URL}/api/lotes/:id`).
 */
export async function fetchLoteById(id: string): Promise<LoteBackendResponse> {
  const response = await authenticatedFetch(`${LIST_LOTES_ENDPOINT}/${id}`, {
    method: "GET",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo obtener el lote solicitado.",
    );
    console.error(
      "[fetchLoteById] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  return parseJson<LoteBackendResponse>(response);
}

/**
 * Cliente → backend NestJS (`PATCH {NEXT_PUBLIC_API_URL}/api/lotes/:id`).
 *
 * Renombra un lote. Devuelve la fila actualizada para que el frontend pueda
 * refrescar su estado en el acto sin re-pedir el detalle.
 */
export async function renameLote(
  id: string,
  nombre: string,
): Promise<LoteBackendResponse> {
  console.info("[renameLote] → PATCH", `${LIST_LOTES_ENDPOINT}/${id}`, {
    nombre,
  });

  const response = await authenticatedFetch(`${LIST_LOTES_ENDPOINT}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre }),
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo renombrar el lote.",
    );
    console.error("[renameLote] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  const data = await parseJson<LoteBackendResponse>(response);
  console.info("[renameLote] ← OK", { id: data.id, nombre: data.nombre });
  return data;
}

/**
 * Cliente → backend NestJS (`PATCH {NEXT_PUBLIC_API_URL}/api/lotes/:id`).
 *
 * (Re)asigna un lote a un establecimiento, o lo desagrupa enviando `null`.
 * Devuelve la fila actualizada para refrescar el estado en el acto.
 */
export async function setLoteEstablecimiento(
  loteId: string,
  establecimientoId: string | null,
): Promise<LoteBackendResponse> {
  console.info("[setLoteEstablecimiento] → PATCH", `${LIST_LOTES_ENDPOINT}/${loteId}`, {
    establecimientoId,
  });

  const response = await authenticatedFetch(`${LIST_LOTES_ENDPOINT}/${loteId}`, {
    method: "PATCH",
    body: JSON.stringify({ establecimientoId }),
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo actualizar el establecimiento del lote.",
    );
    console.error(
      "[setLoteEstablecimiento] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  return parseJson<LoteBackendResponse>(response);
}

/**
 * Cliente → backend NestJS (`DELETE {NEXT_PUBLIC_API_URL}/api/lotes/:id`).
 *
 * Elimina el lote y, en cascada, su análisis GEE. El backend responde
 * `204 No Content`, así que no parseamos body.
 */
export async function deleteLote(id: string): Promise<void> {
  console.info("[deleteLote] → DELETE", `${LIST_LOTES_ENDPOINT}/${id}`);

  const response = await authenticatedFetch(`${LIST_LOTES_ENDPOINT}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo eliminar el lote.",
    );
    console.error("[deleteLote] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  console.info("[deleteLote] ← OK", { id });
}

/**
 * Servidor → Nominatim (OpenStreetMap).
 * Usar desde app/api/.../route.ts u otras rutas del servidor.
 */
export async function fetchNominatimGeocode(
  query: string,
  init?: RequestInit,
): Promise<FlyToLocation> {
  const url = new URL(NOMINATIM_BASE_URL);
  url.searchParams.set("q", query.trim());
  url.searchParams.set("format", "json");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "ar");
  url.searchParams.set("viewbox", PAMPAS_VIEWBOX);
  url.searchParams.set("addressdetails", "0");

  let response: Response;
  try {
    response = await fetch(url.toString(), {
      ...init,
      headers: {
        Accept: "application/json",
        "User-Agent": NOMINATIM_USER_AGENT,
        ...init?.headers,
      },
    });
  } catch {
    throw new ApiServiceError(
      "No se pudo contactar al servicio de ubicación.",
      502,
    );
  }

  if (!response.ok) {
    throw new ApiServiceError(
      "El servicio de ubicación no respondió correctamente.",
      502,
    );
  }

  const results = await parseJson<NominatimResult[]>(response);

  if (!results.length) {
    throw new ApiServiceError(
      "No encontramos esa zona. Probá con la localidad más cercana o con latitud, longitud.",
      404,
    );
  }

  const hit = results[0];
  const lat = Number.parseFloat(hit.lat);
  const lng = Number.parseFloat(hit.lon);

  if (Number.isNaN(lat) || Number.isNaN(lng)) {
    throw new ApiServiceError("Respuesta de ubicación inválida.", 502);
  }

  const precision: LocationPrecision = nominatimTypeToPrecision(
    hit.type,
    hit.class,
  );

  return {
    lat,
    lng,
    label: hit.display_name,
    precision,
    zoom: zoomForPrecision(precision),
    inPampas: isInPampas(lat, lng),
  };
}
