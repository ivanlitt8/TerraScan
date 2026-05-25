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

const SEARCH_MARKER_SOURCE = "terrascan-search-marker";
const SAVED_POLYGON_SOURCE = "terrascan-saved-polygon";

export type FlyToOptions = {
  lng: number;
  lat: number;
  zoom: number;
  label?: string;
};

export type MapHandle = {
  startDrawing: () => void;
  closePolygon: () => boolean;
  clearPolygon: () => void;
  lockEditing: () => void;
  unlockEditing: () => void;
  resize: () => void;
  flyTo: (options: FlyToOptions) => void;
  clearSearchMarker: () => void;
  showSavedPolygon: (feature: Feature<Polygon>) => void;
  clearSavedPolygon: () => void;
};

/**
 * Bounding box ajustado a las coordenadas de un anillo (LinearRing) de Polygon.
 * Usado para `map.fitBounds` cuando seleccionamos un lote guardado: queremos
 * encuadrar exactamente el polígono sin asumir ningún padding fijo en lat/lng.
 */
function polygonBounds(
  feature: Feature<Polygon>,
): [[number, number], [number, number]] | null {
  const ring = feature.geometry.coordinates[0];
  if (!ring?.length) return null;

  let minLng = Infinity;
  let minLat = Infinity;
  let maxLng = -Infinity;
  let maxLat = -Infinity;

  for (const [lng, lat] of ring) {
    if (lng < minLng) minLng = lng;
    if (lat < minLat) minLat = lat;
    if (lng > maxLng) maxLng = lng;
    if (lat > maxLat) maxLat = lat;
  }

  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

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
  const markerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const clearSearchMarkerInternal = useCallback(() => {
    if (markerTimeoutRef.current) {
      clearTimeout(markerTimeoutRef.current);
      markerTimeoutRef.current = null;
    }
    const map = mapRef.current;
    if (!map?.getSource(SEARCH_MARKER_SOURCE)) return;
    const source = map.getSource(SEARCH_MARKER_SOURCE) as maplibregl.GeoJSONSource;
    source.setData({ type: "FeatureCollection", features: [] });
  }, []);

  const clearSavedPolygonInternal = useCallback(() => {
    const map = mapRef.current;
    if (!map?.getSource(SAVED_POLYGON_SOURCE)) return;
    const source = map.getSource(
      SAVED_POLYGON_SOURCE,
    ) as maplibregl.GeoJSONSource;
    source.setData({ type: "FeatureCollection", features: [] });
  }, []);

  const showSearchMarker = useCallback((lng: number, lat: number) => {
    const map = mapRef.current;
    if (!map?.getSource(SEARCH_MARKER_SOURCE)) return;

    const source = map.getSource(SEARCH_MARKER_SOURCE) as maplibregl.GeoJSONSource;
    source.setData({
      type: "FeatureCollection",
      features: [
        {
          type: "Feature",
          geometry: { type: "Point", coordinates: [lng, lat] },
          properties: {},
        },
      ],
    });

    if (markerTimeoutRef.current) clearTimeout(markerTimeoutRef.current);
    markerTimeoutRef.current = setTimeout(() => {
      clearSearchMarkerInternal();
    }, 60_000);
  }, [clearSearchMarkerInternal]);

  useImperativeHandle(ref, () => ({
    startDrawing: () => {
      const draw = drawRef.current;
      if (!draw) return;
      lockedRef.current = false;
      clearSearchMarkerInternal();
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
    unlockEditing: () => {
      lockedRef.current = false;
    },
    resize: () => {
      mapRef.current?.resize();
    },
    flyTo: ({ lng, lat, zoom }) => {
      const map = mapRef.current;
      if (!map) return;
      map.flyTo({ center: [lng, lat], zoom, duration: 1500, essential: true });
      showSearchMarker(lng, lat);
    },
    clearSearchMarker: () => {
      clearSearchMarkerInternal();
    },
    showSavedPolygon: (feature) => {
      const map = mapRef.current;
      if (!map?.getSource(SAVED_POLYGON_SOURCE)) return;

      const source = map.getSource(
        SAVED_POLYGON_SOURCE,
      ) as maplibregl.GeoJSONSource;

      source.setData({
        type: "FeatureCollection",
        features: [
          {
            type: "Feature",
            geometry: feature.geometry,
            properties: {},
          },
        ],
      });

      clearSearchMarkerInternal();

      const bounds = polygonBounds(feature);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 80,
          duration: 1500,
          maxZoom: 16,
          essential: true,
        });
      }
    },
    clearSavedPolygon: () => {
      clearSavedPolygonInternal();
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

    const resizeObserver = new ResizeObserver(() => {
      map.resize();
    });
    resizeObserver.observe(containerRef.current);

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

    const setupSearchMarker = () => {
      if (map.getSource(SEARCH_MARKER_SOURCE)) return;

      map.addSource(SEARCH_MARKER_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: `${SEARCH_MARKER_SOURCE}-layer`,
        type: "circle",
        source: SEARCH_MARKER_SOURCE,
        paint: {
          "circle-radius": 9,
          "circle-color": "#f59e0b",
          "circle-stroke-width": 2,
          "circle-stroke-color": "#ffffff",
        },
      });
    };

    const setupSavedPolygonLayer = () => {
      if (map.getSource(SAVED_POLYGON_SOURCE)) return;

      map.addSource(SAVED_POLYGON_SOURCE, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });

      map.addLayer({
        id: `${SAVED_POLYGON_SOURCE}-fill`,
        type: "fill",
        source: SAVED_POLYGON_SOURCE,
        paint: {
          "fill-color": "#10b981",
          "fill-opacity": 0.18,
        },
      });

      map.addLayer({
        id: `${SAVED_POLYGON_SOURCE}-line`,
        type: "line",
        source: SAVED_POLYGON_SOURCE,
        paint: {
          "line-color": "#34d399",
          "line-width": 2.5,
          "line-opacity": 0.95,
        },
      });
    };

    const onLoad = () => {
      setupSearchMarker();
      setupSavedPolygonLayer();
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
      resizeObserver.disconnect();
      if (markerTimeoutRef.current) clearTimeout(markerTimeoutRef.current);
      teardownDraw?.();
      map.remove();
      mapRef.current = null;
      drawRef.current = null;
    };
  }, [
    emitPolygon,
    syncCanClose,
    clearSearchMarkerInternal,
    clearSavedPolygonInternal,
  ]);

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
