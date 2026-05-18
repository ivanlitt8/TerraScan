"use client";

import "maplibre-gl/dist/maplibre-gl.css";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";

import MapboxDraw from "@mapbox/mapbox-gl-draw";
import type { Feature, Polygon } from "geojson";
import maplibregl from "maplibre-gl";
import { mapDrawStyles } from "@/lib/mapDrawStyles";
import {
  forwardRef,
  useCallback,
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
} from "react";

const PAMPAS_CENTER: [number, number] = [-60.0, -34.6];
const DEFAULT_ZOOM = 6;

/** Capa satelital abierta: Esri World Imagery (sin API key). */
const SATELLITE_STYLE: maplibregl.StyleSpecification = {
  version: 8,
  sources: {
    "esri-world-imagery": {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 19,
      attribution:
        "Tiles © Esri — Esri, Maxar, Earthstar Geographics y la comunidad GIS",
    },
  },
  layers: [
    {
      id: "esri-world-imagery-layer",
      type: "raster",
      source: "esri-world-imagery",
    },
  ],
};

export type MapHandle = {
  startDrawing: () => void;
  closePolygon: () => boolean;
  clearPolygon: () => void;
  lockEditing: () => void;
};

export type MapProps = {
  className?: string;
  onPolygonChange?: (feature: Feature<Polygon> | null) => void;
  onDrawModeChange?: (isDrawing: boolean) => void;
  onCanCloseChange?: (canClose: boolean) => void;
};

function getActivePolygon(draw: MapboxDraw): Feature<Polygon> | null {
  const polygon = draw
    .getAll()
    .features.find(
      (feature): feature is Feature<Polygon> =>
        feature.geometry.type === "Polygon",
    );

  return polygon ?? null;
}

function canCloseDrawing(draw: MapboxDraw): boolean {
  if (draw.getMode() !== "draw_polygon") return false;

  const polygon = getActivePolygon(draw);
  if (!polygon) return false;

  const ring = polygon.geometry.coordinates[0];
  // En draw_polygon el anillo incluye el vértice bajo el cursor; hacen falta ≥3 clics reales.
  return ring.length >= 4;
}

function closeDrawingPolygon(draw: MapboxDraw): boolean {
  if (!canCloseDrawing(draw)) return false;

  const polygon = getActivePolygon(draw);
  if (!polygon?.id) return false;

  draw.changeMode("simple_select", { featureIds: [String(polygon.id)] });
  return true;
}

function enforceSinglePolygon(draw: MapboxDraw): void {
  const polygons = draw
    .getAll()
    .features.filter((feature) => feature.geometry.type === "Polygon");

  if (polygons.length <= 1) return;

  const latest = polygons.at(-1);
  draw.deleteAll();
  if (latest) {
    draw.add(latest);
  }
}

const Map = forwardRef<MapHandle, MapProps>(function Map(
  { className, onPolygonChange, onDrawModeChange, onCanCloseChange },
  ref,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const drawRef = useRef<MapboxDraw | null>(null);
  const lockedRef = useRef(false);

  const notifyPolygonChange = useEffectEvent(
    (feature: Feature<Polygon> | null) => {
      onPolygonChange?.(feature);
    },
  );

  const notifyDrawModeChange = useEffectEvent((isDrawing: boolean) => {
    onDrawModeChange?.(isDrawing);
  });

  const notifyCanCloseChange = useEffectEvent((canClose: boolean) => {
    onCanCloseChange?.(canClose);
  });

  const syncCanClose = useCallback((draw: MapboxDraw) => {
    notifyCanCloseChange(canCloseDrawing(draw));
  }, []);

  const emitPolygon = useCallback((draw: MapboxDraw) => {
    notifyPolygonChange(getActivePolygon(draw));
  }, []);

  useImperativeHandle(ref, () => ({
    startDrawing: () => {
      const draw = drawRef.current;
      if (!draw || lockedRef.current) return;
      draw.changeMode("draw_polygon");
    },
    closePolygon: () => {
      const draw = drawRef.current;
      if (!draw) return false;
      return closeDrawingPolygon(draw);
    },
    clearPolygon: () => {
      const draw = drawRef.current;
      if (!draw) return;
      lockedRef.current = false;
      draw.deleteAll();
      draw.changeMode("simple_select");
      notifyPolygonChange(null);
      notifyCanCloseChange(false);
    },
    lockEditing: () => {
      const draw = drawRef.current;
      if (!draw) return;
      lockedRef.current = true;
      draw.changeMode("simple_select", { featureIds: [] });
      notifyDrawModeChange(false);
      notifyCanCloseChange(false);
    },
  }));

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: SATELLITE_STYLE,
      center: PAMPAS_CENTER,
      zoom: DEFAULT_ZOOM,
    });

    mapRef.current = map;

    const syncDrawMode = (draw: MapboxDraw, mode: string) => {
      const isDrawing = mode === "draw_polygon";
      notifyDrawModeChange(isDrawing);
      if (isDrawing) {
        map.doubleClickZoom.disable();
        syncCanClose(draw);
      } else {
        map.doubleClickZoom.enable();
        notifyCanCloseChange(false);
      }
    };

    const setupDraw = () => {
      if (drawRef.current) return;

      const draw = new MapboxDraw({
        displayControlsDefault: false,
        controls: {},
        defaultMode: "simple_select",
        styles: mapDrawStyles,
      });

      drawRef.current = draw;
      map.addControl(draw as unknown as maplibregl.IControl, "top-left");

      const handleDrawCreate = () => {
        enforceSinglePolygon(draw);
        emitPolygon(draw);
        // No llamar changeMode aquí: draw_polygon.onStop ya cerró el polígono.
      };

      const handleDrawUpdate = () => {
        if (draw.getMode() === "draw_polygon") {
          syncCanClose(draw);
          return;
        }
        enforceSinglePolygon(draw);
        emitPolygon(draw);
      };

      const handleDrawDelete = () => {
        notifyPolygonChange(null);
        notifyCanCloseChange(false);
      };

      const handleModeChange = (event: { mode: string }) => {
        if (lockedRef.current && event.mode !== "simple_select") {
          draw.changeMode("simple_select", { featureIds: [] });
          notifyDrawModeChange(false);
          notifyCanCloseChange(false);
          return;
        }
        syncDrawMode(draw, event.mode);
      };

      const handleSelectionChange = () => {
        if (lockedRef.current) {
          draw.changeMode("simple_select", { featureIds: [] });
        }
      };

      map.on("draw.create", handleDrawCreate);
      map.on("draw.update", handleDrawUpdate);
      map.on("draw.delete", handleDrawDelete);
      map.on("draw.modechange", handleModeChange);
      map.on("draw.selectionchange", handleSelectionChange);
      syncDrawMode(draw, draw.getMode());

      return () => {
        map.off("draw.create", handleDrawCreate);
        map.off("draw.update", handleDrawUpdate);
        map.off("draw.delete", handleDrawDelete);
        map.off("draw.modechange", handleModeChange);
        map.off("draw.selectionchange", handleSelectionChange);
      };
    };

    let teardownDraw: (() => void) | undefined;

    const onLoad = () => {
      teardownDraw = setupDraw();
    };

    if (map.loaded()) {
      onLoad();
    } else {
      map.once("load", onLoad);
    }

    map.addControl(new maplibregl.NavigationControl(), "top-right");
    map.addControl(
      new maplibregl.AttributionControl({ compact: true }),
      "bottom-right",
    );

    return () => {
      teardownDraw?.();
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [emitPolygon, syncCanClose]);

  return (
    <div
      ref={containerRef}
      className={className}
      role="application"
      aria-label="Mapa satelital de Terrascan"
    />
  );
});

export default Map;
