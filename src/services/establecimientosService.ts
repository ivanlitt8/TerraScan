/**
 * Cliente HTTP de Establecimientos (campos) contra el backend NestJS.
 *
 * Endpoints (`/api/establecimientos`, protegidos por Supabase JWT):
 *  - `GET    /`        → lista con conteo de lotes y hectáreas (tarjetas).
 *  - `GET    /:id`     → detalle + lotes del establecimiento.
 *  - `POST   /`        → crear.
 *  - `PATCH  /:id`     → renombrar.
 *  - `DELETE /:id`     → eliminar (los lotes quedan desagrupados, no se borran).
 */

import {
  authenticatedFetch,
  BACKEND_BASE_URL,
  parseBackendError,
} from "@/services/apiService";
import type { LoteListItem } from "@/types/loteAnalysis";

const ENDPOINT = `${BACKEND_BASE_URL}/api/establecimientos`;

/** Item de la lista de establecimientos (tarjeta compacta). */
export interface EstablecimientoListItem {
  id: string;
  nombre: string;
  createdAt: string;
  totalLotes: number;
  totalHectareas: number;
}

/** Detalle de un establecimiento con sus lotes. */
export interface EstablecimientoDetalle {
  id: string;
  nombre: string;
  userId: string;
  createdAt: string;
  lotes: LoteListItem[];
}

export interface FetchOptions {
  signal?: AbortSignal;
}

export async function fetchEstablecimientos(
  options: FetchOptions = {},
): Promise<EstablecimientoListItem[]> {
  const response = await authenticatedFetch(ENDPOINT, {
    method: "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudieron obtener los establecimientos.",
    );
    console.error(
      "[fetchEstablecimientos] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  return response.json() as Promise<EstablecimientoListItem[]>;
}

export async function fetchEstablecimientoById(
  id: string,
  options: FetchOptions = {},
): Promise<EstablecimientoDetalle> {
  const response = await authenticatedFetch(`${ENDPOINT}/${id}`, {
    method: "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo obtener el establecimiento.",
    );
    console.error(
      "[fetchEstablecimientoById] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  return response.json() as Promise<EstablecimientoDetalle>;
}

export async function createEstablecimiento(
  nombre: string,
): Promise<EstablecimientoListItem> {
  const response = await authenticatedFetch(ENDPOINT, {
    method: "POST",
    body: JSON.stringify({ nombre }),
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo crear el establecimiento.",
    );
    console.error(
      "[createEstablecimiento] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  const created = (await response.json()) as {
    id: string;
    nombre: string;
    createdAt: string;
  };
  return { ...created, totalLotes: 0, totalHectareas: 0 };
}

export async function updateEstablecimiento(
  id: string,
  nombre: string,
): Promise<void> {
  const response = await authenticatedFetch(`${ENDPOINT}/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ nombre }),
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo actualizar el establecimiento.",
    );
    console.error(
      "[updateEstablecimiento] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }
}

export async function deleteEstablecimiento(id: string): Promise<void> {
  const response = await authenticatedFetch(`${ENDPOINT}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo eliminar el establecimiento.",
    );
    console.error(
      "[deleteEstablecimiento] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }
}
