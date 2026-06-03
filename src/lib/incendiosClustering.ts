/**
 * Deduplicación de detecciones FIRMS (NASA VIIRS).
 *
 * Problema: el backend devuelve detecciones crudas de los dos satélites
 * VIIRS (Suomi-NPP y NOAA-20). Como las pasadas están separadas por
 * minutos, **el mismo foco térmico aparece dos veces** — una por satélite
 * — con coordenadas casi idénticas. Si la UI dibuja "una alerta por
 * detección" el usuario ve duplicados que en realidad son el mismo evento.
 *
 * Estrategia: clustering greedy por fecha (UTC) + proximidad espacial.
 * Dos detecciones pertenecen al mismo evento si:
 *   - cayeron el **mismo día UTC** (`acq_date` igual), y
 *   - la distancia haversine entre sus centros es **≤ 1 km**.
 *
 * Por qué 1 km: el píxel VIIRS es 375 m × 375 m, así que dos satélites
 * observando el mismo incendio pueden centrar el píxel a ~500 m de
 * diferencia. 1 km da margen sano para errores de georreferenciación y
 * para incendios que se movieron levemente entre pasadas (FIRMS típicamente
 * separa SNPP y NOAA-20 por ~20-40 minutos). Menos de 1 km dejaba pares
 * obvios sin unir en pruebas reales (caso 619977 ↔ 241758 a ~20 m).
 *
 * Por qué greedy O(n²): el endpoint topea en 1000 detecciones por request
 * (ver `MAX_RESULTS` en `IncendiosService`), así que peor caso 10⁶ ops —
 * unos pocos ms en JS. No vale la pena complicar con r-tree o sort-tile
 * recursive para este volumen.
 */

import type { IncendioResponse } from "@/services";

const HAVERSINE_RADIUS_M = 6_371_000;
const CLUSTER_RADIUS_M = 1_000;

const CONFIANZA_ORDEN: Record<string, number> = { l: 0, n: 1, h: 2 };

/**
 * "Evento" = una o más detecciones agrupadas por proximidad espacial +
 * misma fecha. Es la abstracción que consume la UI.
 */
export type IncendioEvento = {
  /** ID estable del cluster (compuesto: `<fecha>-<id-principal>`). */
  id: string;
  /** `YYYY-MM-DD` (UTC) — todas las detecciones agrupadas comparten esta fecha. */
  fecha: string;
  /** Centroide del cluster (promedio de las detecciones que lo componen). */
  latitude: number;
  longitude: number;
  /** Detecciones individuales agrupadas, ordenadas por hora descendente. */
  detecciones: IncendioResponse[];
  /** FRP máximo del cluster en MW (intensidad del foco más caliente). `null` si ninguna detección lo trae. */
  frpMax: number | null;
  /** Confianza máxima del cluster: `"h"` > `"n"` > `"l"`. `null` si ninguna detección la trae. */
  confianzaMax: "l" | "n" | "h" | null;
  /** Satélites únicos que vieron el evento (e.g. `["SNPP", "N20"]`). */
  satelites: string[];
};

/**
 * Agrupa detecciones FIRMS en eventos. Devuelve los eventos ordenados
 * **por fecha descendente** (más recientes arriba), que es lo que la UI
 * espera para listarlos como "alertas".
 */
export function clusterizarDetecciones(
  detecciones: IncendioResponse[],
): IncendioEvento[] {
  // Ordenamos las detecciones de entrada por fecha + hora descendente
  // antes de clusterizar: garantiza que el ID del cluster (`<fecha>-<id>`)
  // quede anclado a la detección más reciente del grupo.
  const sorted = [...detecciones].sort((a, b) => {
    if (a.fecha !== b.fecha) return b.fecha.localeCompare(a.fecha);
    return (b.hora ?? "").localeCompare(a.hora ?? "");
  });

  const clusters: IncendioEvento[] = [];

  for (const det of sorted) {
    const target = clusters.find(
      (c) =>
        c.fecha === det.fecha &&
        haversineMeters(c.latitude, c.longitude, det.latitude, det.longitude) <=
          CLUSTER_RADIUS_M,
    );

    if (target) {
      mergeDeteccionIntoCluster(target, det);
    } else {
      clusters.push({
        id: `${det.fecha}-${det.id}`,
        fecha: det.fecha,
        latitude: det.latitude,
        longitude: det.longitude,
        detecciones: [det],
        frpMax: det.frp,
        confianzaMax: (det.confianza as IncendioEvento["confianzaMax"]) ?? null,
        satelites: [det.satelite],
      });
    }
  }

  return clusters;
}

function mergeDeteccionIntoCluster(
  cluster: IncendioEvento,
  det: IncendioResponse,
): void {
  cluster.detecciones.push(det);
  // Centroide incremental (promedio simple). No re-evaluamos distancia
  // de detecciones ya unidas — con clusters de a lo sumo un puñado de
  // detecciones por incendio, el drift es insignificante.
  const n = cluster.detecciones.length;
  cluster.latitude = (cluster.latitude * (n - 1) + det.latitude) / n;
  cluster.longitude = (cluster.longitude * (n - 1) + det.longitude) / n;

  if (det.frp != null) {
    cluster.frpMax =
      cluster.frpMax != null ? Math.max(cluster.frpMax, det.frp) : det.frp;
  }

  if (det.confianza) {
    cluster.confianzaMax = maxConfianza(cluster.confianzaMax, det.confianza);
  }

  if (!cluster.satelites.includes(det.satelite)) {
    cluster.satelites.push(det.satelite);
  }
}

function maxConfianza(
  a: IncendioEvento["confianzaMax"],
  b: string | null,
): IncendioEvento["confianzaMax"] {
  if (!a) return (b as IncendioEvento["confianzaMax"]) ?? null;
  if (!b) return a;
  const va = CONFIANZA_ORDEN[a] ?? -1;
  const vb = CONFIANZA_ORDEN[b] ?? -1;
  return vb > va ? (b as IncendioEvento["confianzaMax"]) : a;
}

function haversineMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * HAVERSINE_RADIUS_M * Math.asin(Math.sqrt(a));
}

/**
 * Etiqueta legible para una confianza FIRMS. La spec de NASA usa "low /
 * nominal / high" para VIIRS — los traducimos al castellano del MVP.
 */
export function confianzaLabel(
  confianza: IncendioEvento["confianzaMax"],
): string | null {
  switch (confianza) {
    case "h":
      return "alta";
    case "n":
      return "nominal";
    case "l":
      return "baja";
    default:
      return null;
  }
}
