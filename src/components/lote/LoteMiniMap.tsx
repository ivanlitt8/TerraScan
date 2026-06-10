"use client";

import "maplibre-gl/dist/maplibre-gl.css";

import type { Feature, Polygon } from "geojson";
import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

const POLYGON_SOURCE = "lote-mini-polygon";

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

  if (!Number.isFinite(minLng)) return null;
  return [
    [minLng, minLat],
    [maxLng, maxLat],
  ];
}

type LoteMiniMapProps = {
  polygon: Feature<Polygon>;
  /** Alto del contenedor en px. */
  height?: number;
  /**
   * Callback best-effort con un snapshot PNG (data URL) del mapa una vez que
   * las teselas satelitales terminaron de cargar. Se usa para incrustar la
   * vista satelital en el reporte PDF. Devuelve `null` si el canvas quedó
   * "tainted" por CORS o el navegador no permitió exportarlo.
   */
  onSnapshot?: (dataUrl: string | null) => void;
};

/**
 * Mini-mapa read-only centrado en la geometría del lote. Sin herramientas de
 * dibujo ni terreno 3D (más liviano para la ficha). Preparado para evolucionar
 * a mapa interactivo si hace falta.
 */
export default function LoteMiniMap({
  polygon,
  height = 260,
  onSnapshot,
}: LoteMiniMapProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  // Mantenemos `onSnapshot` en un ref para no re-crear el mapa si el callback
  // cambia de identidad entre renders.
  const onSnapshotRef = useRef(onSnapshot);
  onSnapshotRef.current = onSnapshot;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const map = new maplibregl.Map({
      container,
      style: SATELLITE_STYLE,
      center: [-60, -34.6],
      zoom: 6,
      attributionControl: false,
      interactive: true,
      scrollZoom: false,
      boxZoom: false,
      dragRotate: false,
      keyboard: false,
      doubleClickZoom: false,
      touchZoomRotate: false,
      // Necesario para poder exportar el canvas con `toDataURL` (snapshot PDF).
      // En MapLibre v5 los atributos del contexto WebGL viven acá.
      canvasContextAttributes: { preserveDrawingBuffer: true },
    });

    mapRef.current = map;
    let snapshotDone = false;

    map.on("load", () => {
      map.addSource(POLYGON_SOURCE, {
        type: "geojson",
        data: {
          type: "FeatureCollection",
          features: [
            {
              type: "Feature",
              geometry: polygon.geometry,
              properties: {},
            },
          ],
        },
      });

      map.addLayer({
        id: `${POLYGON_SOURCE}-fill`,
        type: "fill",
        source: POLYGON_SOURCE,
        paint: {
          "fill-color": "#10b981",
          "fill-opacity": 0.22,
        },
      });

      map.addLayer({
        id: `${POLYGON_SOURCE}-line`,
        type: "line",
        source: POLYGON_SOURCE,
        paint: {
          "line-color": "#34d399",
          "line-width": 2.5,
        },
      });

      const bounds = polygonBounds(polygon);
      if (bounds) {
        map.fitBounds(bounds, {
          padding: 40,
          duration: 0,
          maxZoom: 15,
        });
      }

      // Snapshot best-effort cuando el mapa quedó quieto y las teselas
      // terminaron de cargar. `idle` se dispara tras el primer render estable.
      const handleIdle = () => {
        if (snapshotDone || !onSnapshotRef.current) return;
        snapshotDone = true;
        map.off("idle", handleIdle);
        try {
          const dataUrl = map.getCanvas().toDataURL("image/png");
          onSnapshotRef.current(dataUrl);
        } catch (cause) {
          console.warn("[LoteMiniMap] No se pudo exportar el snapshot", cause);
          onSnapshotRef.current(null);
        }
      };
      map.on("idle", handleIdle);
    });

    const resizeObserver = new ResizeObserver(() => map.resize());
    resizeObserver.observe(container);

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapRef.current = null;
    };
  }, [polygon]);

  return (
    <div
      ref={containerRef}
      className="w-full overflow-hidden rounded-(--radius-3) border border-(--gray-a5)"
      style={{ height }}
      aria-label="Vista satelital del lote"
    />
  );
}
