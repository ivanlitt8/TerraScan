/**
 * Builders de rutas internas de la app. Centralizar acá evita strings sueltos
 * y deja un único lugar para evolucionar la jerarquía de URLs.
 */

/**
 * Establecimiento por defecto. Todavía no existe la entidad "Establecimiento"
 * en el backend (cada lote pertenece directo al usuario), así que usamos este
 * segmento estable para la jerarquía de rutas. Cuando se modele el campo real,
 * se reemplaza por el id verdadero sin tocar los consumidores.
 */
export const DEFAULT_ESTABLECIMIENTO_ID = "default";

/** `/establecimientos` — listado de campos del usuario. */
export const ESTABLECIMIENTOS_PATH = "/establecimientos";

/** `/establecimientos/:establecimientoId` — detalle del campo con sus lotes. */
export function establecimientoDetallePath(establecimientoId: string): string {
  return `/establecimientos/${encodeURIComponent(establecimientoId)}`;
}

/** `/establecimientos/:establecimientoId/lotes/:loteId` — ficha de detalle. */
export function loteDetallePath(
  loteId: string,
  establecimientoId: string = DEFAULT_ESTABLECIMIENTO_ID,
): string {
  return `/establecimientos/${encodeURIComponent(
    establecimientoId,
  )}/lotes/${encodeURIComponent(loteId)}`;
}
