import { isInPampas, PAMPAS_VIEWBOX } from "@/lib/pampasBounds";
import type { LoteAnalysisResult } from "@/types/loteAnalysis";
import type { Feature, Polygon } from "geojson";
import {
  nominatimTypeToPrecision,
  zoomForPrecision,
  type FlyToLocation,
  type LocationPrecision,
} from "@/lib/locationSearch";

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org/search";
const NOMINATIM_USER_AGENT = "TerrascanMVP/1.0 (geocode; desarrollo local)";

type ApiErrorBody = {
  error?: string;
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
 * Cliente → API interna de análisis del lote (`/api/analyze`).
 */
export async function analyzeLote(
  lote: Feature<Polygon>,
): Promise<LoteAnalysisResult> {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lote }),
  });

  const data = await parseJson<LoteAnalysisResult & ApiErrorBody>(response);

  if (!response.ok) {
    throw new ApiServiceError(
      data.error ?? "No se pudo analizar el lote.",
      response.status,
    );
  }

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
