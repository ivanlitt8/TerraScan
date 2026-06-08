"use client";

/**
 * Hook que **provee la serie temporal NDVI + score de salud** y, por separado,
 * **pinta la capa raster NDVI** del backend.
 *
 * Diseño en dos responsabilidades desacopladas:
 *
 *  A. **Fetch de datos** (`GET /api/lotes/:id/salud-analisis`): se dispara en
 *     cuanto hay `loteId` + `polygon`, **independiente del toggle visual**.
 *     Devuelve en un solo JSON el PNG (blob URL), el bbox, la serie estadística
 *     (`P10D`, Sentinel Hub Statistical API) y el `healthScore`. Expone
 *     `stats`, `healthScore` y `dataStatus` para que el dashboard muestre el
 *     gráfico y el score sin esperar a que el usuario active la capa.
 *
 *  B. **Capa visual** (`map.addSource/addLayer` raster): se dibuja/oculta según
 *     `layerEnabled`. **Apagar la capa NO borra los datos** (`stats`,
 *     `healthScore`): sólo remueve el raster del mapa. El blob URL y el bbox ya
 *     resueltos se reutilizan, así que togglear es instantáneo (sin re-fetch).
 *
 * Bbox: el del backend es la fuente de verdad (mismas coordenadas que Sentinel
 * usó para enmarcar el PNG). El cálculo local sólo es fallback defensivo.
 *
 * Lifecycle:
 *  - Cambios de `loteId`/`polygon` invalidan datos y capa: re-fetch + redibujo.
 *  - El cleanup cancela el fetch en vuelo (AbortController), saca la capa y
 *    libera el blob URL.
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
  /**
   * Controla **únicamente** si la capa raster se dibuja en el mapa. NO afecta
   * el fetch de datos (`stats`/`healthScore`), que ocurre apenas hay lote.
   * `false` → la capa se remueve del mapa pero los datos numéricos se
   * conservan intactos en el panel.
   */
  layerEnabled: boolean;
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

/**
 * Estado del **fetch de datos** NDVI (serie + score). Independiente de si la
 * capa raster está visible o no en el mapa.
 */
export type NDVIDataStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string; isAuthError: boolean };

export type UseNDVILayerReturn = {
  /**
   * Estado del fetch de datos (gráfico + score). El dashboard lo usa para
   * mostrar skeletons mientras carga y el contenido real al resolver.
   */
  dataStatus: NDVIDataStatus;
  /** `true` cuando la capa raster está efectivamente dibujada en el mapa. */
  layerVisible: boolean;
  /** Fuerza un re-fetch (e.g. después de cambiar el rango de fechas). */
  refresh: () => void;
  /**
   * Serie temporal NDVI (intervalos `P10D` agregados por Sentinel Statistical
   * API). Vacía mientras `dataStatus.phase !== "ready"`.
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
  const { map, loteId, polygon, layerEnabled, from, to, opacity, beforeLayerId } =
    options;

  const [dataStatus, setDataStatus] = useState<NDVIDataStatus>({
    phase: "idle",
  });
  const [stats, setStats] = useState<NDVIStatPoint[]>([]);
  const [healthScore, setHealthScore] = useState<HealthScoreSummary | null>(
    null,
  );
  // PNG (blob URL) y bbox ya resueltos. Persisten aunque la capa esté oculta,
  // para que togglear el overlay sea instantáneo (sin re-fetch).
  const [pngObjectUrl, setPngObjectUrl] = useState<string | null>(null);
  const [resolvedBbox, setResolvedBbox] = useState<NDVIBbox | null>(null);
  const [layerVisible, setLayerVisible] = useState(false);
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

  // ── Efecto A: FETCH DE DATOS ─────────────────────────────────────────────
  // Se dispara apenas hay `loteId` + bbox, sin importar `layerEnabled`. Así el
  // gráfico y el score cargan en cuanto se selecciona el lote.
  useEffect(() => {
    if (!loteId || !localBbox) {
      // Sin lote: descartamos datos y el PNG. La capa la limpia el efecto B.
      if (objectUrlRef.current) {
        revokeNDVIObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
      setStats([]);
      setHealthScore(null);
      setPngObjectUrl(null);
      setResolvedBbox(null);
      setDataStatus({ phase: "idle" });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setDataStatus({ phase: "loading" });

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
          revokeNDVIObjectURL(objectUrl);
          return;
        }

        // **Fuente de verdad del bbox**: el que devolvió el backend (idéntico
        // al que Sentinel usó para enmarcar el PNG). El fallback local sólo
        // aplica si el backend mandara `bbox` ausente/nulo.
        const effectiveBbox: NDVIBbox = backendBbox ?? localBbox;
        if (!backendBbox) {
          console.warn(
            "[useNDVILayer] usando bbox local; backend no envió bbox en el JSON",
            { local: localBbox },
          );
        }

        // Revocamos el blob anterior antes de adoptar el nuevo.
        if (objectUrlRef.current) {
          revokeNDVIObjectURL(objectUrlRef.current);
        }
        objectUrlRef.current = objectUrl;

        // Stats: orden cronológico ascendente defensivo para los charts.
        const orderedStats = [...backendStats].sort((a, b) =>
          a.fecha.localeCompare(b.fecha),
        );
        setStats(orderedStats);
        setHealthScore(backendHealthScore);
        setPngObjectUrl(objectUrl);
        setResolvedBbox(effectiveBbox);
        setDataStatus({ phase: "ready" });
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
              : "No se pudo cargar el análisis NDVI.";
        const isAuthError =
          cause instanceof ApiServiceError && cause.status === 401;

        console.error("[useNDVILayer] ✕", cause);
        setStats([]);
        setHealthScore(null);
        setPngObjectUrl(null);
        setResolvedBbox(null);
        setDataStatus({ phase: "error", message, isAuthError });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loteId, localBbox, from, to, refreshToken]);

  // ── Efecto B: CAPA VISUAL ────────────────────────────────────────────────
  // Dibuja u oculta el raster según `layerEnabled`, reutilizando el PNG ya
  // resuelto. Apagar la capa NO toca `stats`/`healthScore`.
  useEffect(() => {
    if (!map) return;

    if (!layerEnabled || !pngObjectUrl || !resolvedBbox) {
      safeRemoveLayer(map, LAYER_ID);
      safeRemoveSource(map, SOURCE_ID);
      setLayerVisible(false);
      return;
    }

    let cancelled = false;

    (async () => {
      // Si el estilo del mapa todavía no terminó de cargar, `addSource` tira.
      if (!map.isStyleLoaded()) {
        await new Promise<void>((resolve) => {
          map.once("idle", () => resolve());
        });
        if (cancelled) return;
      }

      safeRemoveLayer(map, LAYER_ID);
      safeRemoveSource(map, SOURCE_ID);

      map.addSource(SOURCE_ID, {
        type: "image",
        url: pngObjectUrl,
        coordinates: bboxToImageCoordinates(resolvedBbox),
      });

      const layerSpec: maplibregl.RasterLayerSpecification = {
        id: LAYER_ID,
        type: "raster",
        source: SOURCE_ID,
        paint: {
          "raster-opacity": opacity ?? DEFAULT_OPACITY,
          "raster-fade-duration": 0,
        },
      };

      if (beforeLayerId && map.getLayer(beforeLayerId)) {
        map.addLayer(layerSpec, beforeLayerId);
      } else {
        map.addLayer(layerSpec);
      }

      setLayerVisible(true);
    })();

    return () => {
      cancelled = true;
      safeRemoveLayer(map, LAYER_ID);
      safeRemoveSource(map, SOURCE_ID);
    };
  }, [map, layerEnabled, pngObjectUrl, resolvedBbox, beforeLayerId, opacity]);

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

  return { dataStatus, layerVisible, refresh, stats, healthScore };
}
