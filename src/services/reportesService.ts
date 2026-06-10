/**
 * Cliente HTTP del Centro de Descargas (reportes) contra el backend NestJS,
 * más la subida del PDF al bucket privado de Supabase Storage.
 *
 * Endpoints (`/api/reportes`, protegidos por Supabase JWT):
 *  - `GET    /`              → lista los reportes activos del usuario.
 *  - `POST   /`              → registra la metadata de un reporte.
 *  - `GET    /:id/download`  → URL firmada temporal para descargar el PDF.
 *  - `DELETE /:id`           → soft delete (lo oculta del historial).
 *
 * El binario del PDF NO pasa por el backend: se sube directo del navegador al
 * bucket privado con la sesión de Supabase (RLS), y al backend sólo le llega
 * el `urlStorage` (path relativo dentro del bucket).
 */

import {
  ApiServiceError,
  authenticatedFetch,
  BACKEND_BASE_URL,
  parseBackendError,
} from "@/services/apiService";
import { createClient as createSupabaseBrowserClient } from "@/utils/supabase/client";

const ENDPOINT = `${BACKEND_BASE_URL}/api/reportes`;

/**
 * Bucket privado donde viven los PDFs. Debe coincidir con
 * `SUPABASE_STORAGE_BUCKET` del backend. Configurable por env para no hardcodear
 * el nombre en dos lados si se renombra.
 */
export const REPORTES_BUCKET =
  process.env.NEXT_PUBLIC_SUPABASE_REPORTES_BUCKET ?? "reportes";

/** Fila de reporte tal como la devuelve el backend. */
export interface ReporteListItem {
  id: string;
  nombre: string;
  establecimiento: string | null;
  urlStorage: string;
  userId: string;
  loteId: string | null;
  isDeleted: boolean;
  createdAt: string;
}

/** Respuesta de la URL firmada de descarga. */
export interface ReporteSignedUrl {
  url: string;
  expiresIn: number;
  nombre: string;
}

export interface CreateReporteInput {
  nombre: string;
  establecimiento?: string | null;
  urlStorage: string;
  loteId?: string | null;
}

export interface UploadReportePdfInput {
  blob: Blob;
  /** Lote asociado (define la carpeta dentro del bucket). */
  loteId?: string | null;
  /** Nombre de archivo legible (sin extensión), ya "slugificado". */
  slug: string;
}

export interface FetchOptions {
  signal?: AbortSignal;
}

/**
 * Sube el PDF al bucket privado de Supabase Storage y devuelve el path
 * relativo (lo que después se persiste como `urlStorage`).
 *
 * El path se namespacea por usuario (`<userId>/...`) para que las políticas RLS
 * del bucket puedan restringir cada objeto a su dueño.
 */
export async function uploadReportePdf({
  blob,
  loteId,
  slug,
}: UploadReportePdfInput): Promise<string> {
  const supabase = createSupabaseBrowserClient();

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new ApiServiceError(
      "Sesión no encontrada. Iniciá sesión para guardar el reporte.",
      401,
    );
  }

  const userId = data.user.id;
  const path = `${userId}/${loteId ?? "sin-lote"}/${Date.now()}-${slug}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(REPORTES_BUCKET)
    .upload(path, blob, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("[uploadReportePdf] ✕ storage", uploadError.message);
    throw new ApiServiceError(
      `No se pudo subir el PDF al almacenamiento: ${uploadError.message}`,
      0,
    );
  }

  return path;
}

/** Registra la metadata del reporte en el backend (`POST /api/reportes`). */
export async function createReporte(
  input: CreateReporteInput,
): Promise<ReporteListItem> {
  const body = {
    nombre: input.nombre,
    urlStorage: input.urlStorage,
    ...(input.establecimiento ? { establecimiento: input.establecimiento } : {}),
    ...(input.loteId ? { loteId: input.loteId } : {}),
  };

  const response = await authenticatedFetch(ENDPOINT, {
    method: "POST",
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo guardar el reporte en el historial.",
    );
    console.error("[createReporte] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  return response.json() as Promise<ReporteListItem>;
}

/** Lista los reportes activos del usuario (`GET /api/reportes`). */
export async function fetchReportes(
  options: FetchOptions = {},
): Promise<ReporteListItem[]> {
  const response = await authenticatedFetch(ENDPOINT, {
    method: "GET",
    signal: options.signal,
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudieron obtener los reportes.",
    );
    console.error("[fetchReportes] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }

  return response.json() as Promise<ReporteListItem[]>;
}

/**
 * Pide al backend una URL firmada temporal para descargar el PDF
 * (`GET /api/reportes/:id/download`).
 */
export async function getReporteDownloadUrl(
  id: string,
): Promise<ReporteSignedUrl> {
  const response = await authenticatedFetch(`${ENDPOINT}/${id}/download`, {
    method: "GET",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo generar el enlace de descarga.",
    );
    console.error(
      "[getReporteDownloadUrl] ✕ HTTP",
      apiError.status,
      apiError.message,
    );
    throw apiError;
  }

  return response.json() as Promise<ReporteSignedUrl>;
}

/** Soft delete: oculta el reporte del historial (`DELETE /api/reportes/:id`). */
export async function deleteReporte(id: string): Promise<void> {
  const response = await authenticatedFetch(`${ENDPOINT}/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const apiError = await parseBackendError(
      response,
      "No se pudo eliminar el reporte.",
    );
    console.error("[deleteReporte] ✕ HTTP", apiError.status, apiError.message);
    throw apiError;
  }
}
