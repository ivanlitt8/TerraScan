import { isInPampas, PAMPAS_VIEWBOX } from "@/lib/pampasBounds";
import type {
  AnalyzeLoteRequestBody,
  LoteBackendResponse,
} from "@/types/loteAnalysis";
import {
  nominatimTypeToPrecision,
  zoomForPrecision,
  type FlyToLocation,
  type LocationPrecision,
} from "@/lib/locationSearch";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "TerrascanMVP/1.0 (geocode; desarrollo local)";

const BACKEND_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3001";
const ANALYZE_LOTE_ENDPOINT = `${BACKEND_BASE_URL}/api/lotes/analyze`;

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
 * Cliente → API interna de Next.js (`/api/geocode`).
 * Usar desde componentes con `"use client"`.
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

/**
 * Cliente → backend NestJS (`POST {NEXT_PUBLIC_API_URL}/api/lotes/analyze`).
 *
 * Persiste el lote en Supabase (vía Prisma) y devuelve la fila completa,
 * incluido el `id` (UUID) y `areaHectareas` calculado con Turf en el server.
 */
export async function analyzeLote(
  body: AnalyzeLoteRequestBody,
): Promise<LoteBackendResponse> {
  const payload: AnalyzeLoteRequestBody = {
    nombre: body.nombre,
    poligonoGeoJSON: sanitizePoligonoGeoJSON(body.poligonoGeoJSON),
  };

  console.info("[analyzeLote] → POST", ANALYZE_LOTE_ENDPOINT, {
    nombre: payload.nombre,
    vertices: payload.poligonoGeoJSON.geometry.coordinates[0]?.length ?? 0,
  });

  let response: Response;
  try {
    response = await fetch(ANALYZE_LOTE_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (cause) {
    console.error("[analyzeLote] ✕ network error", cause);
    throw new ApiServiceError(
      "No se pudo contactar al backend de Terrascan.",
      0,
    );
  }

  const data = (await parseJson<LoteBackendResponse & ApiErrorBody>(
    response,
  ).catch(() => ({}) as LoteBackendResponse & ApiErrorBody));

  if (!response.ok) {
    const fallback =
      typeof data.message === "string"
        ? data.message
        : Array.isArray(data.message)
          ? data.message.join(" · ")
          : data.error;

    console.error("[analyzeLote] ✕ HTTP", response.status, fallback);
    throw new ApiServiceError(
      fallback ?? "No se pudo analizar el lote.",
      response.status,
    );
  }

  console.info("[analyzeLote] ← OK", {
    id: data.id,
    nombre: data.nombre,
    areaHectareas: data.areaHectareas,
    createdAt: data.createdAt,
  });

  return data;
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
