"use client";

/**
 * Hook que **pinta la capa NDVI + provee la serie temporal NDVI** del backend.
 *
 *   1. Fetch autenticado a `GET /api/lotes/:id/salud-analisis` (vía
 *      `lotesService.getSaludAnalisis`). Endpoint compuesto que devuelve
 *      en un solo JSON el PNG (base64), el bbox y la serie estadística
 *      por intervalos `P10D` agregada por Sentinel Hub Statistical API.
 *   2. **Bbox del backend** como fuente de verdad — son las mismas
 *      coordenadas que Sentinel usó para enmarcar el PNG, sin drift posible.
 *      Fallback: cálculo local idéntico a `turf.bbox` si el backend no lo
 *      enviara (defensivo; el endpoint nuevo siempre lo manda).
 *   3. `map.addSource({ type: 'image', url, coordinates })` con las 4 esquinas
 *      del bbox en orden top-left → top-right → bottom-right → bottom-left.
 *   4. `map.addLayer({ type: 'raster', paint: { 'raster-opacity': 0.7 } })`
 *      por encima del raster satelital base, **antes** del polígono guardado
 *      (para que el contorno emerald no quede tapado por el NDVI).
 *   5. Expone `stats: NDVIStatPoint[]` para que el dashboard pueda dibujar
 *      el gráfico de evolución sin hacer otra request.
 *
 * Lifecycle:
 *  - Mientras `enabled === false` no se hace ninguna petición.
 *  - Cambios de `loteId` o `polygon` invalidan la capa anterior: removeLayer,
 *    removeSource, `revokeObjectURL` y nuevo fetch.
 *  - El `cleanup` del effect cancela el fetch en vuelo (AbortController), saca
 *    la capa y libera el blob URL.
 */

import {
  ApiServiceError,
  getSaludAnalisis,
  revokeNDVIObjectURL,
  type HealthScoreSummary,
  type NDVIBbox,
  type NDVIStatPoint,
} from "@/services";
import type { Feature, Polygon } from "geojson";
import type maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type UseNDVILayerOptions = {
  /** Instancia viva de `maplibregl.Map`. Cuando es `null`, el hook no hace nada. */
  map: maplibregl.Map | null;
  /** UUID del lote para el endpoint `GET /api/lotes/:id/salud`. */
  loteId: string | null;
  /** Polígono GeoJSON del lote. Se usa para calcular el bbox del overlay. */
  polygon: Feature<Polygon> | null;
  /** Si `false`, no carga la capa (o la remueve si ya estaba puesta). */
  enabled: boolean;
  /** Rango temporal opcional (default backend = últimos 30 días). */
  from?: string;
  to?: string;
  /**
   * Opacidad del raster NDVI [0–1]. Default 0.7 — permite ver el relieve y la
   * imagen satelital debajo sin perder el dominio del verde/rojo.
   */
  opacity?: number;
  /**
   * `id` de la capa **encima de la cual** queremos pintar el NDVI. Si se
   * provee, MapLibre inserta la capa NDVI *justo antes* de `beforeLayerId`
   * (orden Z controlado). Default: `undefined` → se pinta al tope.
   *
   * Útil cuando hay capas decorativas (contorno emerald del lote, marcadores)
   * que deben quedar visibles por encima del overlay.
   */
  beforeLayerId?: string;
};

export type NDVILayerStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string; isAuthError: boolean };

export type UseNDVILayerReturn = {
  status: NDVILayerStatus;
  /** Fuerza un re-fetch (e.g. después de cambiar el rango de fechas). */
  refresh: () => void;
  /**
   * Serie temporal NDVI (intervalos `P10D` agregados por Sentinel Statistical
   * API). Vacía mientras `status.phase !== "ready"`. Útil para alimentar
   * gráficos / tablas en el dashboard sin disparar una segunda request.
   */
  stats: NDVIStatPoint[];
  /**
   * Resumen agronómico del estado de salud del lote (score, categoría,
   * fecha de referencia). `null` hasta que el endpoint resuelva por primera
   * vez con éxito. Lo provee el backend a partir de la serie estadística.
   */
  healthScore: HealthScoreSummary | null;
};

const SOURCE_ID = "terrascan-ndvi-source";
const LAYER_ID = "terrascan-ndvi-layer";
const DEFAULT_OPACITY = 0.7;

/**
 * Calcula bbox `[minLng, minLat, maxLng, maxLat]` de un Polygon GeoJSON.
 *
 * Se usa solo como **fallback**: la fuente de verdad del bbox es el backend
 * (header `X-NDVI-Bbox`, idéntico al que Sentinel usó para enmarcar el PNG).
 * Si por alguna razón el header no llega (proxy intermedio que lo stripee,
 * deploy con versión vieja del backend, etc.) usamos este cálculo local —
 * reproduce la fórmula de `turf.bbox` que usa el backend, así que en el
 * peor caso seguimos coincidiendo dentro del error de coma flotante.
 *
 * Implementación manual (sin Turf) para no agregar ~80 KB al bundle.
 */
function calcBboxFallback(
  polygon: Feature<Polygon>,
): NDVIBbox | null {
  const rings = polygon.geometry.coordinates;
  if (!rings.length || !rings[0].length) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const ring of rings) {
    for (const [lng, lat] of ring) {
      if (lng < minLng) minLng = lng;
      if (lat < minLat) minLat = lat;
      if (lng > maxLng) maxLng = lng;
      if (lat > maxLat) maxLat = lat;
    }
  }

  if (!Number.isFinite(minLng)) return null;
  return [minLng, minLat, maxLng, maxLat];
}

/**
 * Coordenadas de `image` source en MapLibre: 4 esquinas en sentido horario
 * empezando por top-left. Cada una es `[lng, lat]`.
 *
 *    [tl]──[tr]
 *      │    │
 *    [bl]──[br]
 */
function bboxToImageCoordinates(
  bbox: NDVIBbox,
): [
  [number, number],
  [number, number],
  [number, number],
  [number, number],
] {
  const [minLng, minLat, maxLng, maxLat] = bbox;
  return [
    [minLng, maxLat], // top-left
    [maxLng, maxLat], // top-right
    [maxLng, minLat], // bottom-right
    [minLng, minLat], // bottom-left
  ];
}

/**
 * Helpers de limpieza idempotentes. MapLibre tira si pedimos `removeLayer`
 * sobre una capa que ya no existe (e.g. tras `map.remove()` o style swap),
 * así que envolvemos en try/catch silencioso.
 */
function safeRemoveLayer(map: maplibregl.Map, layerId: string): void {
  try {
    if (map.getLayer(layerId)) map.removeLayer(layerId);
  } catch {
    /* noop */
  }
}

function safeRemoveSource(map: maplibregl.Map, sourceId: string): void {
  try {
    if (map.getSource(sourceId)) map.removeSource(sourceId);
  } catch {
    /* noop */
  }
}

export function useNDVILayer(
  options: UseNDVILayerOptions,
): UseNDVILayerReturn {
  const { map, loteId, polygon, enabled, from, to, opacity, beforeLayerId } =
    options;

  const [status, setStatus] = useState<NDVILayerStatus>({ phase: "idle" });
  const [stats, setStats] = useState<NDVIStatPoint[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreSummary | null>(
    null,
  );
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  // Mantenemos el blob URL en una ref para poder revocarlo en cleanup sin
  // re-renderizar. React 19 con strict mode dispara el effect dos veces en
  // desarrollo; sin esta ref, el segundo run filtraría el primer blob.
  const objectUrlRef = useRef<string | null>(null);

  // Bbox local de fallback: estable si el polígono no cambia. Sólo se usa
  // si el backend no envía el header `X-NDVI-Bbox` (caso degradado).
  const localBbox = useMemo(
    () => (polygon ? calcBboxFallback(polygon) : null),
    [polygon],
  );

  useEffect(() => {
    if (!map || !enabled || !loteId || !localBbox) {
      // Si el hook se "apaga" (toggle off, lote nulo, etc.) limpiamos lo que
      // hubiera quedado pintado del run anterior.
      if (map) {
        safeRemoveLayer(map, LAYER_ID);
        safeRemoveSource(map, SOURCE_ID);
      }
      if (objectUrlRef.current) {
        revokeNDVIObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setStats([]);
      setHealthScore(null);
      setStatus({ phase: "idle" });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setStatus({ phase: "loading" });

    (async () => {
      try {
        const {
          objectUrl,
          bbox: backendBbox,
          stats: backendStats,
          healthScore: backendHealthScore,
        } = await getSaludAnalisis({
          loteId,
          from,
          to,
          signal: controller.signal,
        });

        if (cancelled) {
          // El effect se desmontó mientras esperábamos: revocamos
          // inmediatamente para no leakar el blob.
          revokeNDVIObjectURL(objectUrl);
          return;
        }

        // **Fuente de verdad del bbox**: lo que devolvió el backend en el
        // JSON — son las mismas coordenadas que Sentinel usó para enmarcar
        // el PNG. El fallback local sólo aplica si por alguna razón
        // hipotética el backend mandara `bbox` ausente/nulo en el JSON.
        const effectiveBbox: NDVIBbox = backendBbox ?? localBbox;
        if (!backendBbox) {
          console.warn(
            "[useNDVILayer] usando bbox local; backend no envió bbox en el JSON",
            { local: localBbox },
          );
        }

        // Si el style del mapa todavía no terminó de cargar, `addSource` tira.
        // Esperamos a `idle` (frame completo) o `load` (estilo listo) según
        // el caso. En la práctica el mapa ya cargó antes de que el usuario
        // abra el dashboard del lote, así que el `if` es defensivo.
        if (!map.isStyleLoaded()) {
          await new Promise<void>((resolve) => {
            map.once("idle", () => resolve());
          });
          if (cancelled) {
            revokeNDVIObjectURL(objectUrl);
            return;
          }
        }

        // Si llegó otro NDVI antes, revocamos el viejo.
        if (objectUrlRef.current) {
          revokeNDVIObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = objectUrl;

        // Limpieza pre-add: si re-renderizamos con un loteId nuevo, removemos
        // la capa anterior con el sourceId compartido (sólo una capa NDVI
        // viva a la vez por mapa).
        safeRemoveLayer(map, LAYER_ID);
        safeRemoveSource(map, SOURCE_ID);

        map.addSource(SOURCE_ID, {
          type: "image",
          url: objectUrl,
          coordinates: bboxToImageCoordinates(effectiveBbox),
        });

        // `beforeId` controla el orden Z dentro del style. Si se provee y la
        // capa existe, el NDVI queda debajo de ella; si no existe, MapLibre
        // ignora el parámetro y pinta al tope (comportamiento aceptable).
        const layerSpec: maplibregl.RasterLayerSpecification = {
          id: LAYER_ID,
          type: "raster",
          source: SOURCE_ID,
          paint: {
            "raster-opacity": opacity ?? DEFAULT_OPACITY,
            // `raster-fade-duration: 0` evita el fade-in default de 300ms;
            // para overlays bajo demanda el flash es más rápido de entender.
            "raster-fade-duration": 0,
          },
        };

        if (beforeLayerId && map.getLayer(beforeLayerId)) {
          map.addLayer(layerSpec, beforeLayerId);
        } else {
          map.addLayer(layerSpec);
        }

        // Stats: aseguramos orden cronológico ascendente para los charts.
        // Sentinel suele devolverlo ya ordenado, pero ordenamos defensivamente
        // para no acoplarnos a un detalle de implementación remoto.
        const orderedStats = [...backendStats].sort((a, b) =>
          a.fecha.localeCompare(b.fecha),
        );
        setStats(orderedStats);
        setHealthScore(backendHealthScore);
        setStatus({ phase: "ready" });
      } catch (cause) {
        if (cancelled) return;

        const isAbort =
          cause instanceof DOMException && cause.name === "AbortError";
        if (isAbort) return;

        const message =
          cause instanceof ApiServiceError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "No se pudo cargar la capa NDVI.";
        const isAuthError =
          cause instanceof ApiServiceError && cause.status === 401;

        console.error("[useNDVILayer] ✕", cause);
        setStats([]);
        setHealthScore(null);
        setStatus({ phase: "error", message, isAuthError });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
      // No removemos el blob URL acá si la capa quedó pintada y exitosa: el
      // próximo run (con loteId nuevo o `enabled=false`) hará la limpieza.
      // Si NO quedó pintada (error), el catch ya descartó el blob.
    };
  }, [
    beforeLayerId,
    enabled,
    from,
    loteId,
    localBbox,
    map,
    opacity,
    refreshToken,
    to,
  ]);

  // Cleanup final al desmontar: el caller puede haber removido el `map` ya,
  // así que defensivamente verificamos.
  useEffect(() => {
    return () => {
      if (map) {
        safeRemoveLayer(map, LAYER_ID);
        safeRemoveSource(map, SOURCE_ID);
      }
      if (objectUrlRef.current) {
        revokeNDVIObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  }, [map]);

  return { status, refresh, stats, healthScore };
}
