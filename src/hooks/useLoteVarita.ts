"use client";

/**
 * Hook que orquesta la **Varita Mágica** de TerraScan.
 *
 * UX: el usuario activa la herramienta, hace `mousedown` sobre el mapa,
 * arrastra dibujando un rectángulo, y al soltar el botón se ejecuta
 * `samService.predictMask(canvas, { bbox })`. SAM con bounding box devuelve
 * contornos mucho más completos y rectos para lotes rurales que con un
 * único punto positivo (que se queda dentro de manchas de vegetación).
 *
 * Pipeline interno (mouseup → polígono):
 *
 *   1. Normalización del bbox dibujado a CSS pixels relativos al canvas.
 *   2. `samService.predictMask(canvas, { bbox })`.
 *   3. `d3-contour` (marching squares, threshold 0.5) → contornos en
 *      pixel-space físicos.
 *   4. Selección del anillo con mayor área.
 *   5. `@turf/simplify` con tolerancia BAJA (0.5 px) para preservar los
 *      ángulos rectos que SAM devuelve gracias al bbox.
 *   6. Reproyección con `map.unproject([cssX, cssY])`.
 *   7. Cierre defensivo del anillo y `Feature<Polygon>`.
 *
 * Convenciones:
 *  - Las coordenadas en el hook viven en CSS pixels relativos al canvas
 *    del mapa (lo que entrega `event.point` de MapLibre). El paso a píxeles
 *    físicos lo hace `samService` con `devicePixelRatio` internamente.
 *  - El hook **no** muta el mapa: `setPolygon` y similares quedan en manos
 *    del consumidor (MapaWorkspace) mediante `onPolygonDetected`.
 */

import {
  samService,
  SamServiceError,
  type BBoxCoords,
  type SamMaskResult,
} from "@/services/samService";
import { polygon as turfPolygon } from "@turf/helpers";
import { contours as d3Contours } from "d3-contour";
import type { Feature, Polygon } from "geojson";
import type maplibregl from "maplibre-gl";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

export type VaritaPhase =
  | "idle"
  | "loading-model"
  | "active"
  | "dragging"
  | "detecting"
  | "error";

/**
 * Rect en CSS pixels relativos al canvas del mapa.
 *
 * Si `width` o `height` son negativos significa que el usuario está
 * arrastrando hacia arriba/izquierda; la UI debe leer `x, y, width, height`
 * con `Math.min`/`Math.abs` para renderizar sin sorpresas. (Lo hace el
 * propio hook al exponer `dragBox`: siempre top-left + dimensiones >= 0.)
 */
export type DragBoxRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type UseLoteVaritaOptions = {
  /** Acceso al mapa MapLibre. Cuando es `null`, el hook permanece inerte. */
  getMap: () => maplibregl.Map | null;
  /** Permite controlar el cursor del canvas (crosshair, default, etc.). */
  setCursor?: (cursor: string | null) => void;
  /**
   * Callback ejecutado cuando obtenemos un polígono válido tras el drag.
   * Recibe el feature en coordenadas geográficas (lng/lat).
   */
  onPolygonDetected: (feature: Feature<Polygon>) => void;
  /** Hook opcional para limpiar el estado previo (dibujo manual) al activarse. */
  onActivate?: () => void;
  /**
   * Hook opcional invocado cuando una detección falla (sin contorno claro
   * o error de inferencia). El consumidor puede usarlo para abrir
   * directamente el modo de dibujo manual.
   */
  onFallbackToManual?: () => void;
};

export type UseLoteVaritaReturn = {
  phase: VaritaPhase;
  errorMessage: string | null;
  isActive: boolean;
  /** Rectángulo en vivo durante el drag, o `null`. La UI lo renderiza. */
  dragBox: DragBoxRect | null;
  /** Activa la herramienta. Si el modelo no está cargado, lo descarga. */
  activate: () => Promise<void>;
  /** Desactiva la herramienta sin tocar el polígono detectado. */
  deactivate: () => void;
  /** Limpia el callout de error (e.g. al cerrar el banner). */
  clearError: () => void;
};

/** Threshold del marching squares; SlimSAM emite máscara `{0,1}` binarizada. */
const MASK_THRESHOLD = 0.5;
/** Mínimo de vértices del anillo crudo antes de simplificar (descarta ruido). */
const MIN_RING_VERTICES = 8;
/**
 * Número objetivo de vértices del polígono final tras Visvalingam-Whyatt.
 *
 * El razonamiento: un lote rural típico tiene 4–6 esquinas reales. Dejamos
 * hasta 12 para que VW preserve curvas intencionales (parcelas en L, lotes
 * con esquinas matadas) sin acumular ruido del marching squares. Si el
 * usuario quiere más detalle, MapboxDraw en `direct_select` le permite
 * arrastrar y agregar vértices intermedios.
 */
const MAX_OUTPUT_VERTICES = 12;
/**
 * Mínimo tamaño del bbox en CSS pixels para considerarse un "drag" real
 * (vs. un click accidental que apenas mueve el mouse). Si el rect es menor,
 * cancelamos sin disparar inferencia.
 */
const MIN_DRAG_SIZE_PX = 12;

export function useLoteVarita(
  options: UseLoteVaritaOptions,
): UseLoteVaritaReturn {
  const {
    getMap,
    setCursor,
    onPolygonDetected,
    onActivate,
    onFallbackToManual,
  } = options;

  const [phase, setPhase] = useState<VaritaPhase>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [dragBox, setDragBox] = useState<DragBoxRect | null>(null);

  // Referencias para evitar stale-closure issues en listeners de MapLibre.
  const phaseRef = useRef<VaritaPhase>("idle");
  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  // Handlers de listeners suscritos al mapa. Los guardamos para poder
  // desuscribirlos sin pelearnos con el compilador de React 19.
  const handlersRef = useRef<{
    down: ((event: maplibregl.MapMouseEvent) => void) | null;
    move: ((event: maplibregl.MapMouseEvent) => void) | null;
    up: ((event: maplibregl.MapMouseEvent) => void) | null;
  }>({ down: null, move: null, up: null });

  // Punto inicial del drag en CSS pixels relativos al canvas.
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);

  const isActive =
    phase === "active" || phase === "dragging" || phase === "detecting";

  const restoreCursor = useCallback(() => {
    setCursor?.(null);
  }, [setCursor]);

  /**
   * Desuscribe todos los listeners del mapa y reactiva `dragPan`/`boxZoom`
   * que habíamos desactivado para que MapLibre no compitiera con el dibujo
   * del bbox.
   */
  const detach = useCallback(() => {
    const map = getMap();
    if (map) {
      const handlers = handlersRef.current;
      if (handlers.down) map.off("mousedown", handlers.down);
      if (handlers.move) map.off("mousemove", handlers.move);
      if (handlers.up) map.off("mouseup", handlers.up);

      // Restituir interacciones del mapa si las habíamos deshabilitado.
      try {
        map.dragPan.enable();
        map.boxZoom.enable();
      } catch {
        // En desmontes ya no hay map vivo; silenciamos.
      }
    }
    handlersRef.current = { down: null, move: null, up: null };
    dragStartRef.current = null;
    setDragBox(null);
    restoreCursor();
  }, [getMap, restoreCursor]);

  const deactivate = useCallback(() => {
    detach();
    phaseRef.current = "idle";
    setPhase("idle");
  }, [detach]);

  const clearError = useCallback(() => {
    setErrorMessage(null);
    if (phaseRef.current === "error") {
      phaseRef.current = "idle";
      setPhase("idle");
    }
  }, []);

  /**
   * Toma la máscara binaria que devolvió SAM y la convierte en un
   * `Feature<Polygon>` en lng/lat listo para inyectar en MapboxDraw.
   */
  const maskToFeature = useCallback(
    (
      map: maplibregl.Map,
      result: SamMaskResult,
    ): Feature<Polygon> | null => {
      const ring = maskToPixelRing(result);
      if (!ring) return null;

      // d3-contour devuelve píxeles físicos del bitmap. Para `map.unproject`
      // necesitamos CSS pixels: dividimos por `pixelScale`.
      const cssRing: [number, number][] = ring.map(([px, py]) => [
        px / result.pixelScale,
        py / result.pixelScale,
      ]);

      // Simplificamos en pixel-space con Visvalingam-Whyatt. VW prioriza
      // vértices por importancia (área triangular con sus vecinos) y
      // preserva las "esquinas clave" de la forma, en vez de redondearlas
      // como hace Douglas-Peucker con la silueta orgánica de SAM.
      const simplifiedRing = simplifyVisvalingamWhyatt(
        cssRing,
        MAX_OUTPUT_VERTICES,
      );
      if (!simplifiedRing || simplifiedRing.length < 4) return null;

      const lngLatRing: [number, number][] = simplifiedRing.map(
        ([cssX, cssY]) => {
          const lngLat = map.unproject([cssX, cssY]);
          return [lngLat.lng, lngLat.lat];
        },
      );

      return turfPolygon([closeRing(lngLatRing)], {
        source: "ai-varita",
        score: result.score,
        provider: result.provider,
        vertexCount: simplifiedRing.length - 1,
      });
    },
    [],
  );

  /**
   * Ejecuta la inferencia con el bbox que el usuario arrastró y procesa
   * el resultado.
   *
   * Tras éxito vuelve a `idle` y desuscribe los listeners. Esto es
   * importante: el polígono detectado se inyecta en MapboxDraw en modo
   * `direct_select`, y si dejáramos los listeners de drag activos
   * competirían con el arrastre de vértices que el usuario va a hacer
   * para corregir el polígono. Si el usuario quiere otra detección, vuelve
   * a clickear el botón Sparkles.
   */
  const runInference = useCallback(
    async (bbox: BBoxCoords) => {
      const map = getMap();
      if (!map) return;

      phaseRef.current = "detecting";
      setPhase("detecting");
      setErrorMessage(null);
      setDragBox(null);

      try {
        console.info("[useLoteVarita] inferencia con bbox", bbox);
        const canvas = map.getCanvas();
        const result = await samService.predictMask(canvas, { bbox });

        const feature = maskToFeature(map, result);
        if (!feature) {
          setErrorMessage(
            "No detectamos un contorno claro dentro del rectángulo. Probá encerrando el lote con más margen o dibujá manualmente.",
          );
          phaseRef.current = "error";
          setPhase("error");
          detach();
          onFallbackToManual?.();
          return;
        }

        onPolygonDetected(feature);
        // Volvemos a `idle` y soltamos los listeners para que el usuario
        // pueda editar los vértices del polígono recién inyectado sin que
        // el `mousedown` siga interpretándose como inicio de otro bbox.
        detach();
        phaseRef.current = "idle";
        setPhase("idle");
      } catch (cause) {
        const message =
          cause instanceof SamServiceError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "La detección automática falló.";
        console.error("[useLoteVarita] ✕ inferencia", cause);
        setErrorMessage(message);
        phaseRef.current = "error";
        setPhase("error");
        detach();
        onFallbackToManual?.();
      }
    },
    [detach, getMap, maskToFeature, onFallbackToManual, onPolygonDetected],
  );

  // ---------------------------------------------------------------------
  // Listeners del mapa (mousedown / mousemove / mouseup)
  // ---------------------------------------------------------------------

  const onMapMouseDown = useCallback((event: maplibregl.MapMouseEvent) => {
    if (phaseRef.current !== "active") return;
    if (event.originalEvent.button !== 0) return; // sólo botón izquierdo

    // MapLibre dispara este evento ANTES de su propio drag-pan. Como ya
    // desactivamos `dragPan` en `activate()`, no entra en conflicto, pero
    // por las dudas detenemos la propagación para que ninguna otra capa
    // (e.g. MapboxDraw) tome el evento.
    event.preventDefault();

    dragStartRef.current = { x: event.point.x, y: event.point.y };
    phaseRef.current = "dragging";
    setPhase("dragging");
    setDragBox({
      x: event.point.x,
      y: event.point.y,
      width: 0,
      height: 0,
    });
  }, []);

  const onMapMouseMove = useCallback((event: maplibregl.MapMouseEvent) => {
    if (phaseRef.current !== "dragging") return;
    const start = dragStartRef.current;
    if (!start) return;

    const x1 = Math.min(start.x, event.point.x);
    const y1 = Math.min(start.y, event.point.y);
    const x2 = Math.max(start.x, event.point.x);
    const y2 = Math.max(start.y, event.point.y);
    setDragBox({ x: x1, y: y1, width: x2 - x1, height: y2 - y1 });
  }, []);

  const onMapMouseUp = useCallback(
    (event: maplibregl.MapMouseEvent) => {
      if (phaseRef.current !== "dragging") return;
      const start = dragStartRef.current;
      dragStartRef.current = null;
      if (!start) return;

      const x1 = Math.min(start.x, event.point.x);
      const y1 = Math.min(start.y, event.point.y);
      const x2 = Math.max(start.x, event.point.x);
      const y2 = Math.max(start.y, event.point.y);
      const width = x2 - x1;
      const height = y2 - y1;

      // Click accidental: el usuario soltó casi en el mismo punto. No
      // disparamos inferencia (sería ruido garantizado); volvemos a
      // `active` para esperar un drag real.
      if (width < MIN_DRAG_SIZE_PX || height < MIN_DRAG_SIZE_PX) {
        phaseRef.current = "active";
        setPhase("active");
        setDragBox(null);
        return;
      }

      void runInference([x1, y1, x2, y2]);
    },
    [runInference],
  );

  // ---------------------------------------------------------------------
  // activate / deactivate
  // ---------------------------------------------------------------------

  const activate = useCallback(async () => {
    const map = getMap();
    if (!map) {
      setErrorMessage("El mapa todavía no está disponible.");
      phaseRef.current = "error";
      setPhase("error");
      return;
    }

    onActivate?.();
    setErrorMessage(null);

    // Cargar modelo si hace falta. Si ya está cacheado, esto es instantáneo.
    if (samService.getStatus().phase !== "ready") {
      phaseRef.current = "loading-model";
      setPhase("loading-model");
      try {
        await samService.loadModels();
      } catch (cause) {
        const message =
          cause instanceof SamServiceError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "No se pudo cargar el modelo de IA.";
        setErrorMessage(message);
        phaseRef.current = "error";
        setPhase("error");
        return;
      }
    }

    // Reiniciamos listeners antes de registrar para evitar duplicados si
    // `activate` se llamó dos veces seguidas.
    detach();

    // Desactivamos drag-pan y box-zoom del mapa: el primero arruina el
    // drag (movería el mapa en vez de dibujar bbox), y el segundo
    // intercepta `shift + drag` que el usuario podría usar por costumbre.
    map.dragPan.disable();
    map.boxZoom.disable();

    handlersRef.current = {
      down: onMapMouseDown,
      move: onMapMouseMove,
      up: onMapMouseUp,
    };
    map.on("mousedown", onMapMouseDown);
    map.on("mousemove", onMapMouseMove);
    map.on("mouseup", onMapMouseUp);

    phaseRef.current = "active";
    setPhase("active");
    setCursor?.("crosshair");

    console.info(
      "[useLoteVarita] herramienta activa: esperando click + arrastrar",
    );
  }, [
    detach,
    getMap,
    onActivate,
    onMapMouseDown,
    onMapMouseMove,
    onMapMouseUp,
    setCursor,
  ]);

  // Cleanup al desmontar — evita listeners zombi si el usuario sale de la
  // ruta /mapa con la varita activa.
  useEffect(() => {
    return () => {
      detach();
    };
  }, [detach]);

  return useMemo(
    () => ({
      phase,
      errorMessage,
      isActive,
      dragBox,
      activate,
      deactivate,
      clearError,
    }),
    [activate, clearError, deactivate, dragBox, errorMessage, isActive, phase],
  );
}

/**
 * Convierte la máscara binaria a un anillo (`LinearRing`) de píxeles físicos.
 * Usa `d3-contour` con `marching squares` y se queda con el contorno de
 * mayor área (anillo exterior del lote dominante).
 */
function maskToPixelRing(result: SamMaskResult): [number, number][] | null {
  const { mask, width, height } = result;

  // `d3-contour` espera `number[]` (ArrayLike); `Array.from` materializa el
  // `Uint8Array`. Para máscaras grandes (~ 2 M pixeles) pesa, pero es
  // necesario porque d3 hace random access tipado.
  const flat = Array.from(mask);
  const generator = d3Contours()
    .size([width, height])
    .thresholds([MASK_THRESHOLD]);
  const contours = generator(flat);
  if (!contours.length) return null;

  let bestRing: [number, number][] | null = null;
  let bestArea = 0;

  for (const contour of contours) {
    for (const poly of contour.coordinates) {
      const outer = poly[0];
      if (!outer || outer.length < MIN_RING_VERTICES) continue;
      const area = Math.abs(polygonArea(outer));
      if (area > bestArea) {
        bestArea = area;
        bestRing = outer.map(([x, y]) => [x, y]);
      }
    }
  }

  return bestRing;
}

/** Cierra el anillo si el último vértice no coincide con el primero. */
function closeRing(ring: [number, number][]): [number, number][] {
  if (!ring.length) return ring;
  const [firstX, firstY] = ring[0];
  const [lastX, lastY] = ring[ring.length - 1];
  if (firstX === lastX && firstY === lastY) return ring;
  return [...ring, [firstX, firstY]];
}

/** Shoelace formula sobre un anillo en pixel-space. Signo descartado. */
function polygonArea(ring: ReadonlyArray<ReadonlyArray<number>>): number {
  let sum = 0;
  const n = ring.length;
  for (let i = 0; i < n - 1; i += 1) {
    const a = ring[i];
    const b = ring[i + 1];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum / 2;
}

/**
 * Simplifica un anillo por **Visvalingam-Whyatt**.
 *
 * Por qué VW y no Douglas-Peucker para máscaras de SAM:
 *  - DP suaviza la silueta orgánica entera y tiende a redondear las esquinas
 *    reales del lote junto con el ruido del marching squares.
 *  - VW puntúa cada vértice por el **área triangular** que forma con sus
 *    vecinos: los vértices "redundantes" (alineados con sus vecinos) tienen
 *    área baja y se eliminan primero; las esquinas verdaderas tienen área
 *    alta y sobreviven hasta el final.
 *
 * Implementación: lista doblemente enlazada implícita (`prev` / `next` /
 * `removed` arrays) con cache de áreas. Recalcular sólo los vecinos del
 * vértice eliminado en cada iteración. Búsqueda de mínimo en `O(n)` por
 * iteración — overkill un heap para n ~ 300.
 *
 * @param ring Anillo (con o sin cierre explícito).
 * @param targetVertices Número objetivo de vértices únicos. El anillo
 *   devuelto siempre incluye el cierre, así que la longitud final es
 *   `target + 1` (o menor si el input era más chico).
 */
function simplifyVisvalingamWhyatt(
  ring: ReadonlyArray<readonly [number, number]>,
  targetVertices: number,
): [number, number][] {
  if (!ring.length) return [];

  // Detectar y quitar cierre si el último punto coincide con el primero.
  const closed =
    ring.length > 1 &&
    ring[0][0] === ring[ring.length - 1][0] &&
    ring[0][1] === ring[ring.length - 1][1];
  const open: [number, number][] = closed
    ? (ring.slice(0, -1).map(([x, y]) => [x, y]) as [number, number][])
    : (ring.map(([x, y]) => [x, y]) as [number, number][]);

  const n = open.length;
  const minVertices = Math.max(3, Math.min(targetVertices, n));
  if (n <= minVertices) {
    return [...open, [open[0][0], open[0][1]]];
  }

  const removed = new Array<boolean>(n).fill(false);
  const prev = new Array<number>(n);
  const next = new Array<number>(n);
  const area = new Array<number>(n);

  for (let i = 0; i < n; i += 1) {
    prev[i] = (i - 1 + n) % n;
    next[i] = (i + 1) % n;
  }

  const triArea = (i: number): number => {
    const p = open[prev[i]];
    const c = open[i];
    const x = open[next[i]];
    // Doble del área triangular sin dividir (la comparación relativa no
    // necesita el factor 1/2; ahorra una división por vértice y por
    // iteración).
    return Math.abs((x[0] - p[0]) * (c[1] - p[1]) - (c[0] - p[0]) * (x[1] - p[1]));
  };

  for (let i = 0; i < n; i += 1) area[i] = triArea(i);

  let alive = n;
  while (alive > minVertices) {
    let minI = -1;
    let minA = Infinity;
    for (let i = 0; i < n; i += 1) {
      if (removed[i]) continue;
      if (area[i] < minA) {
        minA = area[i];
        minI = i;
      }
    }
    if (minI === -1) break;

    const p = prev[minI];
    const x = next[minI];
    next[p] = x;
    prev[x] = p;
    removed[minI] = true;
    alive -= 1;

    // Sólo los vecinos del vértice eliminado cambiaron su triángulo.
    if (!removed[p]) area[p] = triArea(p);
    if (!removed[x]) area[x] = triArea(x);
  }

  let start = -1;
  for (let i = 0; i < n; i += 1) {
    if (!removed[i]) {
      start = i;
      break;
    }
  }
  if (start === -1) return [];

  const result: [number, number][] = [];
  let i = start;
  do {
    result.push([open[i][0], open[i][1]]);
    i = next[i];
  } while (i !== start);

  result.push([open[start][0], open[start][1]]);
  return result;
}
