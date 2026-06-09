"use client";

import CrearLoteDialog, {
  type CrearLoteValues,
} from "@/components/CrearLoteDialog";
import DashboardLote from "@/components/DashboardLote";
import LocationSearch from "@/components/LocationSearch";
import Map, { type MapHandle } from "@/components/Map";
import PanelLotesList from "@/components/PanelLotesList";
import { useAnalisisEspacial } from "@/hooks/useAnalisisEspacial";
import { useIncendios } from "@/hooks/useIncendios";
import { useLoteVarita } from "@/hooks/useLoteVarita";
import { useNDVILayer } from "@/hooks/useNDVILayer";
import {
  NDVI_DEFAULT_PERIOD,
  useNDVISerie,
  type NDVIPeriodId,
} from "@/hooks/useNDVISerie";
import { clusterizarDetecciones } from "@/lib/incendiosClustering";
import type { FlyToLocation } from "@/lib/locationSearch";
import {
  analyzeLote,
  ApiServiceError,
  deleteLote,
  fetchLoteById,
  renameLote,
} from "@/services";
import type {
  LoteAnalysisResult,
  LoteBackendResponse,
} from "@/types/loteAnalysis";
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  IconButton,
  Tooltip,
} from "@radix-ui/themes";
import type { Feature, Polygon } from "geojson";
import { Layers, Loader2, Sparkles, X } from "lucide-react";
import type maplibregl from "maplibre-gl";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

/**
 * `id` de la capa decorativa (contorno emerald) del polígono guardado en
 * `Map.tsx`. El hook `useNDVILayer` lo recibe en `beforeLayerId` para
 * insertar el NDVI **debajo** del contorno y que éste siga siendo visible.
 *
 * Mantener sincronizado con `SAVED_POLYGON_SOURCE + '-fill'` en Map.tsx.
 */
const SAVED_POLYGON_FILL_LAYER_ID = "terrascan-saved-polygon-fill";
const SAVED_POLYGON_LINE_LAYER_ID = "terrascan-saved-polygon-line";

/**
 * Área (en hectáreas) del anillo exterior de un polígono GeoJSON usando la
 * aproximación esférica estándar. Sólo para mostrar contexto en el diálogo de
 * creación; el valor oficial lo recalcula el backend con Turf.
 */
function calcularHectareas(polygon: Feature<Polygon> | null): number {
  const ring = polygon?.geometry?.coordinates?.[0];
  if (!ring || ring.length < 4) return 0;

  const R = 6378137; // radio terrestre (m)
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  let total = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1, lat1] = ring[i];
    const [lon2, lat2] = ring[i + 1];
    total +=
      toRad(lon2 - lon1) *
      (2 + Math.sin(toRad(lat1)) + Math.sin(toRad(lat2)));
  }
  const areaM2 = Math.abs((total * R * R) / 2);
  return areaM2 / 10_000;
}

export default function MapaWorkspace() {
  const router = useRouter();
  const mapRef = useRef<MapHandle>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [polygon, setPolygon] = useState<Feature<Polygon> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LoteAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  // Diálogo previo a la creación (nombre + establecimiento). El nombre
  // sugerido se congela al abrir para usarse como placeholder estable.
  const [crearDialogOpen, setCrearDialogOpen] = useState(false);
  const [nombreSugerido, setNombreSugerido] = useState("");
  const [isLotesPanelOpen, setIsLotesPanelOpen] = useState(false);
  const [ndviEnabled, setNdviEnabled] = useState(false);
  // Período del gráfico NDVI (solo afecta al gráfico; el score y la capa
  // siguen usando la ventana "actual" de 30 días).
  const [ndviPeriod, setNdviPeriod] = useState<NDVIPeriodId>(
    NDVI_DEFAULT_PERIOD,
  );
  // Lote guardado actualmente seleccionado (con su geometría), para poder
  // re-seleccionarlo al hacer clic sobre su polígono en el mapa.
  const selectedLoteRef = useRef<LoteBackendResponse | null>(null);
  // Id del lote activo en el panel: distingue "re-clic del mismo lote"
  // (sólo re-encuadra) de "lote distinto" (resetea overlays NDVI).
  const currentLoteIdRef = useRef<string | null>(null);

  const panelOpen = Boolean(analysis);
  const showMapToolbar = !panelOpen && !isAnalyzing;
  const areaHectareasPoligono = useMemo(
    () => calcularHectareas(polygon),
    [polygon],
  );

  const handleMapReady = useCallback((instance: maplibregl.Map) => {
    setMapInstance(instance);
  }, []);

  const resetAnalysis = useCallback(() => {
    setAnalysis(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
    // Al limpiar el análisis también apagamos el overlay NDVI: si el usuario
    // dibuja un lote nuevo no queremos mostrar la salud del lote viejo.
    setNdviEnabled(false);
    // Reseteamos el período del gráfico a la ventana actual para el próximo lote.
    setNdviPeriod(NDVI_DEFAULT_PERIOD);
    selectedLoteRef.current = null;
    currentLoteIdRef.current = null;
  }, []);

  /**
   * Selecciona un lote guardado: pinta su polígono, encuadra la cámara y, lo
   * más importante, setea el estado compartido (`analysis` + `polygon`) que
   * abre el `DashboardLote` y dispara los hooks de datos (NDVI, incendios,
   * GEE). Es el punto único de selección, lo usan tanto el panel de "Mis
   * lotes" como el clic sobre el polígono en el mapa.
   */
  const handleSelectLote = useCallback((lote: LoteBackendResponse) => {
    const isSameLote = currentLoteIdRef.current === lote.id;
    currentLoteIdRef.current = lote.id;
    selectedLoteRef.current = lote;

    setIsLotesPanelOpen(false);
    mapRef.current?.clearPolygon();
    mapRef.current?.showSavedPolygon(lote.poligonoGeoJSON);

    setAnalysisError(null);
    setConfirmed(true);
    setPolygon(lote.poligonoGeoJSON);
    // Sólo reseteamos overlays/serie cuando cambia el lote: re-clickear el
    // mismo polígono no debe apagar la capa NDVI ni el período del gráfico.
    if (!isSameLote) {
      setNdviEnabled(false);
      setNdviPeriod(NDVI_DEFAULT_PERIOD);
    }
    setAnalysis({
      id: lote.id,
      nombre: lote.nombre,
      hectareas: lote.areaHectareas,
      procesadoEn: lote.createdAt,
    });
  }, []);

  const handlePolygonChange = useCallback(
    (feature: Feature<Polygon> | null) => {
      setPolygon(feature);
      if (feature) {
        setConfirmed(false);
        setIsDrawing(false);
        resetAnalysis();
      }
    },
    [resetAnalysis],
  );

  const handleAiPolygonDetected = useCallback(
    (feature: Feature<Polygon>) => {
      // Inyectamos el polígono en MapboxDraw: dispara `onPolygonChange` y
      // reusamos el mismo flujo de "Confirmar lote" que el dibujo manual.
      mapRef.current?.setPolygon(feature);
    },
    [],
  );

  const getMapInstance = useCallback(
    () => mapRef.current?.getInstance() ?? null,
    [],
  );

  const setMapCursor = useCallback((cursor: string | null) => {
    mapRef.current?.setCursor(cursor);
  }, []);

  const handleVaritaActivate = useCallback(() => {
    // Al activar la varita borramos cualquier dibujo manual previo para
    // que la inferencia parta de un mapa "limpio" y no haya doble polígono.
    setConfirmed(false);
    resetAnalysis();
    mapRef.current?.clearPolygon();
    mapRef.current?.clearSavedPolygon();
  }, [resetAnalysis]);

  const handleStartDrawing = useCallback(() => {
    setConfirmed(false);
    resetAnalysis();
    mapRef.current?.unlockEditing();
    mapRef.current?.clearPolygon();
    requestAnimationFrame(() => {
      mapRef.current?.startDrawing();
    });
  }, [resetAnalysis]);

  const handleVaritaFallbackToManual = useCallback(() => {
    // Cuando SAM no devuelve un contorno claro, asumimos que el lote es
    // demasiado irregular o la imagen tiene poco contraste; dejamos al
    // usuario directamente en modo de dibujo manual para no perder tiempo.
    handleStartDrawing();
  }, [handleStartDrawing]);

  const varita = useLoteVarita({
    getMap: getMapInstance,
    setCursor: setMapCursor,
    onPolygonDetected: handleAiPolygonDetected,
    onActivate: handleVaritaActivate,
    onFallbackToManual: handleVaritaFallbackToManual,
  });

  // NDVI: el hook hace dos cosas desacopladas.
  //  1. Datos (serie + score): se piden apenas hay lote confirmado + polígono,
  //     sin importar el toggle → el gráfico y el score cargan solos.
  //  2. Capa raster: se dibuja sólo si `layerEnabled` (toggle del panel).
  // Apagar la capa NO borra los datos numéricos del panel.
  const ndviLayer = useNDVILayer({
    map: mapInstance,
    loteId: analysis?.id ?? null,
    polygon,
    layerEnabled: ndviEnabled,
    opacity: 0.7,
    beforeLayerId: SAVED_POLYGON_FILL_LAYER_ID,
  });

  // Serie del gráfico NDVI. Para el período default (30 días) reusa la serie
  // que ya trajo `useNDVILayer` (cero llamadas extra); para 3/6/12 meses pide
  // `salud-stats` sin tocar el score ni la capa.
  const ndviSerie = useNDVISerie({
    loteId: analysis?.id ?? null,
    period: ndviPeriod,
    baseSerie: ndviLayer.stats,
    baseStatus: ndviLayer.dataStatus.phase,
  });

  // Incendios FIRMS reales (NASA VIIRS · SNPP + NOAA-20). El hook dispara
  // `GET /api/lotes/:id/incendios` cuando se confirma un lote y mantiene
  // estado interno; acá lo consumimos sólo en su forma deduplicada para
  // pasársela al `DashboardLote` y reemplazar el mock de "Alertas críticas".
  const incendios = useIncendios({ loteId: analysis?.id ?? null });

  // Clusterizamos las detecciones crudas (los dos satélites suelen ver
  // el mismo foco con minutos de diferencia → duplicados). El hook ya
  // ordena por fecha, pero el clustering vive en `@/lib` porque es
  // lógica pura (sin React) reutilizable desde tests o un futuro panel
  // expandido del evento. Memo para evitar re-clusterizar en cada render.
  const incendiosClusters = useMemo(
    () => (incendios.data ? clusterizarDetecciones(incendios.data) : null),
    [incendios.data],
  );

  // Análisis espacial GEE (elevación SRTM + inundaciones GFD). El hook
  // dispara `GET /api/gee/analisis/:loteId` al confirmar un lote. Pasamos los
  // eventos de inundación reales al `DashboardLote` para reemplazar el mock;
  // mientras carga/falla (`data` null) cae al mock automáticamente.
  const analisis = useAnalisisEspacial({ loteId: analysis?.id ?? null });

  const handleToggleNDVI = useCallback(() => {
    setNdviEnabled((prev) => !prev);
  }, []);

  // Si el backend devuelve 401 mientras pedimos los datos NDVI, propagamos al
  // mismo redirect que usa el resto del workspace para no dejar al usuario
  // con un panel a medio cargar.
  useEffect(() => {
    if (
      ndviLayer.dataStatus.phase === "error" &&
      ndviLayer.dataStatus.isAuthError
    ) {
      const search = new URLSearchParams({
        tab: "login",
        error: "Tu sesión expiró. Iniciá sesión nuevamente.",
      });
      router.replace(`/?${search.toString()}`);
    }
  }, [ndviLayer.dataStatus, router]);

  const handleGoTo = useCallback((location: FlyToLocation) => {
    mapRef.current?.flyTo({
      lng: location.lng,
      lat: location.lat,
      zoom: location.zoom,
      label: location.label,
    });
  }, []);

  const handleCloseContour = () => {
    mapRef.current?.closePolygon();
  };

  const handleClear = () => {
    mapRef.current?.clearPolygon();
    setConfirmed(false);
    resetAnalysis();
  };

  /** Nombre por defecto fechado, usado como placeholder y fallback del diálogo. */
  const generarNombreSugerido = () =>
    `Lote — ${new Date().toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    })}`;

  /**
   * Abre el diálogo de creación. NO crea el lote: si el usuario cancela, el
   * polígono y el estado "Confirmar lote" se conservan intactos.
   */
  const handleOpenCrearDialog = () => {
    if (!polygon || isAnalyzing) return;
    setAnalysisError(null);
    setNombreSugerido(generarNombreSugerido());
    setCrearDialogOpen(true);
  };

  /**
   * Crea el lote con el nombre y establecimiento elegidos en el diálogo.
   * El backend exige `nombre` (1–120 chars) en el DTO `AnalyzeLoteDto`.
   */
  const handleConfirm = async (values: CrearLoteValues) => {
    if (!polygon || isAnalyzing) return;
    setConfirmed(true);
    setAnalysisError(null);
    setAnalysis(null);
    setIsAnalyzing(true);
    mapRef.current?.lockEditing();

    try {
      const lote = await analyzeLote({
        nombre: values.nombre,
        poligonoGeoJSON: polygon,
        establecimientoId: values.establecimientoId,
      });

      // Sólo guardamos la identidad real del lote (Supabase + Turf). Las
      // métricas (NDVI, score, incendios, inundaciones) las resuelven los
      // hooks dedicados contra sus endpoints reales — sin mocks intermedios.
      setAnalysis({
        id: lote.id,
        nombre: lote.nombre,
        hectareas: lote.areaHectareas,
        procesadoEn: lote.createdAt,
      });
      setCrearDialogOpen(false);
    } catch (error) {
      if (error instanceof ApiServiceError && error.status === 401) {
        const search = new URLSearchParams({
          tab: "login",
          error: "Tu sesión expiró. Iniciá sesión para analizar tu lote.",
        });
        router.replace(`/?${search.toString()}`);
        return;
      }

      const message =
        error instanceof ApiServiceError
          ? error.message
          : "No se pudo completar el análisis del lote.";
      setAnalysisError(message);
      setConfirmed(false);
      setCrearDialogOpen(false);
      mapRef.current?.unlockEditing();
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleClearLote = () => {
    setConfirmed(false);
    resetAnalysis();
    mapRef.current?.clearPolygon();
    mapRef.current?.clearSavedPolygon();
  };

  const handleAuthError = useCallback(() => {
    const search = new URLSearchParams({
      tab: "login",
      error: "Tu sesión expiró. Iniciá sesión nuevamente.",
    });
    router.replace(`/?${search.toString()}`);
  }, [router]);

  const handleRefreshAnalysis = useCallback(() => {
    analisis.refresh({ force: true });
  }, [analisis]);

  const redirectToLogin = useCallback(
    (message: string) => {
      const search = new URLSearchParams({ tab: "login", error: message });
      router.replace(`/?${search.toString()}`);
    },
    [router],
  );

  /**
   * Renombra el lote en el backend y refleja el nuevo nombre en el estado
   * sin perder el análisis actual (NDVI, incendios, GEE siguen montados).
   * Rechaza el error hacia el panel para que muestre feedback inline.
   */
  const handleRenameLote = useCallback(
    async (loteId: string, nuevoNombre: string) => {
      try {
        const updated = await renameLote(loteId, nuevoNombre);
        setAnalysis((prev) =>
          prev && prev.id === loteId
            ? { ...prev, nombre: updated.nombre }
            : prev,
        );
        if (selectedLoteRef.current?.id === loteId) {
          selectedLoteRef.current = {
            ...selectedLoteRef.current,
            nombre: updated.nombre,
          };
        }
      } catch (error) {
        if (error instanceof ApiServiceError && error.status === 401) {
          redirectToLogin("Tu sesión expiró. Iniciá sesión nuevamente.");
          return;
        }
        throw error;
      }
    },
    [redirectToLogin],
  );

  /**
   * Elimina el lote (y en cascada su análisis GEE) en el backend. La limpieza
   * del panel/mapa la dispara el propio `DashboardLote` vía `onClear` cuando
   * esta promesa resuelve, para mantener el orquestado de UI en un solo lugar.
   */
  const handleDeleteLote = useCallback(
    async (loteId: string) => {
      try {
        await deleteLote(loteId);
      } catch (error) {
        if (error instanceof ApiServiceError && error.status === 401) {
          redirectToLogin("Tu sesión expiró. Iniciá sesión nuevamente.");
          return;
        }
        throw error;
      }
    },
    [redirectToLogin],
  );

  // Clic sobre el polígono guardado en el mapa → re-selecciona el lote (abre
  // el panel si estuviera cerrado). Cursor "pointer" al pasar por encima para
  // señalizar que es interactivo.
  useEffect(() => {
    const map = mapInstance;
    if (!map) return;

    const onClick = () => {
      const lote = selectedLoteRef.current;
      if (lote) handleSelectLote(lote);
    };
    const setPointer = () => {
      map.getCanvas().style.cursor = "pointer";
    };
    const clearPointer = () => {
      map.getCanvas().style.cursor = "";
    };

    for (const layerId of [
      SAVED_POLYGON_FILL_LAYER_ID,
      SAVED_POLYGON_LINE_LAYER_ID,
    ]) {
      map.on("click", layerId, onClick);
      map.on("mouseenter", layerId, setPointer);
      map.on("mouseleave", layerId, clearPointer);
    }

    return () => {
      for (const layerId of [
        SAVED_POLYGON_FILL_LAYER_ID,
        SAVED_POLYGON_LINE_LAYER_ID,
      ]) {
        map.off("click", layerId, onClick);
        map.off("mouseenter", layerId, setPointer);
        map.off("mouseleave", layerId, clearPointer);
      }
    };
  }, [mapInstance, handleSelectLote]);

  // Deep-link desde el Dashboard (`/mapa?lote=<id>`): apenas el mapa está
  // listo, traemos el lote por id y lo seleccionamos (abre el panel + enfoca
  // la cámara). Se ejecuta una sola vez y limpia el query de la URL para no
  // re-disparar al re-renderizar o navegar internamente.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (!mapInstance || deepLinkHandledRef.current) return;

    const loteId = new URLSearchParams(window.location.search).get("lote");
    if (!loteId) return;

    deepLinkHandledRef.current = true;
    window.history.replaceState(null, "", "/mapa");

    fetchLoteById(loteId)
      .then((lote) => handleSelectLote(lote))
      .catch((error) => {
        if (error instanceof ApiServiceError && error.status === 401) {
          redirectToLogin("Tu sesión expiró. Iniciá sesión nuevamente.");
        }
        // 404/otros: no enfocamos nada; el usuario queda en el mapa base.
      });
  }, [mapInstance, handleSelectLote, redirectToLogin]);

  useEffect(() => {
    if (!panelOpen) return;
    const id = requestAnimationFrame(() => {
      mapRef.current?.resize();
    });
    return () => cancelAnimationFrame(id);
  }, [panelOpen]);

  useEffect(() => {
    if (!isDrawing) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Enter") {
        event.preventDefault();
        mapRef.current?.closePolygon();
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDrawing]);

  return (
    <Grid
      height="100%"
      width="100%"
      gap="0"
      className="overflow-hidden transition-[grid-template-columns] duration-300 ease-out"
      columns={
        panelOpen
          ? { initial: "1fr", lg: "minmax(0, 1fr) min(30%, 420px)" }
          : "1fr"
      }
      rows={
        panelOpen
          ? { initial: "minmax(0, 1fr) minmax(0, 42dvh)", lg: "1fr" }
          : "1fr"
      }
    >
      <Flex
        direction="column"
        position="relative"
        height="100%"
        style={{ minHeight: 0, minWidth: 0 }}
      >
        <Box
          position="absolute"
          top="4"
          left="0"
          right="0"
          className="z-10 pointer-events-none"
        >
          <Flex justify="center" px="4">
            <LocationSearch onGoTo={handleGoTo} disabled={confirmed || isAnalyzing} />
          </Flex>
        </Box>

        <Box flexGrow="1" style={{ minHeight: 0, minWidth: 0, position: "relative", zIndex: 0 }}>
          <Map
            ref={mapRef}
            className="h-full w-full"
            onPolygonChange={handlePolygonChange}
            onDrawModeChange={setIsDrawing}
            onCanCloseChange={setCanClose}
            onMapReady={handleMapReady}
          />

          <PanelLotesList
            isOpen={isLotesPanelOpen}
            onClose={() => setIsLotesPanelOpen(false)}
            onLoteSelect={handleSelectLote}
            onAuthError={handleAuthError}
          />

          {!isLotesPanelOpen && (
            <Box
              position="absolute"
              left="4"
              top="4"
              className="pointer-events-auto z-20"
            >
              <Flex direction="column" gap="2">
                <Tooltip content="Mis lotes" side="right">
                  <IconButton
                    type="button"
                    size="3"
                    radius="full"
                    variant="solid"
                    color="jade"
                    aria-label="Abrir panel de mis lotes"
                    onClick={() => setIsLotesPanelOpen(true)}
                  >
                    <Layers size={18} aria-hidden />
                  </IconButton>
                </Tooltip>

                <Tooltip
                  content={
                    varita.phase === "loading-model"
                      ? "Descargando modelo de IA…"
                      : varita.isActive
                        ? "Hacé clic y arrastrá para encerrar el lote"
                        : "Detectar lote con IA (clic + arrastrar)"
                  }
                  side="right"
                >
                  <IconButton
                    type="button"
                    size="3"
                    radius="full"
                    variant={varita.isActive ? "soft" : "solid"}
                    color={varita.isActive ? "amber" : "iris"}
                    aria-label={
                      varita.isActive
                        ? "Desactivar detección automática"
                        : "Activar detección automática de lote"
                    }
                    aria-pressed={varita.isActive}
                    disabled={
                      varita.phase === "loading-model" ||
                      varita.phase === "detecting" ||
                      isAnalyzing
                    }
                    onClick={() => {
                      if (varita.isActive) {
                        varita.deactivate();
                      } else {
                        void varita.activate();
                      }
                    }}
                  >
                    {varita.phase === "loading-model" ||
                    varita.phase === "detecting" ? (
                      <Loader2 size={18} className="animate-spin" aria-hidden />
                    ) : varita.isActive ? (
                      <X size={18} aria-hidden />
                    ) : (
                      <Sparkles size={18} aria-hidden />
                    )}
                  </IconButton>
                </Tooltip>
              </Flex>
            </Box>
          )}

          {(varita.phase === "loading-model" ||
            varita.phase === "active" ||
            varita.phase === "dragging" ||
            varita.phase === "detecting") && (
            <Box
              position="absolute"
              top="4"
              left="50%"
              className="z-20 pointer-events-none -translate-x-1/2"
              style={{ maxWidth: "26rem", width: "calc(100% - 2rem)" }}
            >
              <Callout.Root
                size="1"
                color={
                  varita.phase === "loading-model"
                    ? "iris"
                    : varita.phase === "detecting"
                      ? "jade"
                      : "amber"
                }
              >
                <Callout.Icon>
                  {varita.phase === "active" || varita.phase === "dragging" ? (
                    <Sparkles size={14} aria-hidden />
                  ) : (
                    <Loader2 size={14} className="animate-spin" aria-hidden />
                  )}
                </Callout.Icon>
                <Callout.Text>
                  {varita.phase === "loading-model"
                    ? "Descargando modelo SlimSAM (sólo la primera vez)…"
                    : varita.phase === "detecting"
                      ? "Detectando el contorno del lote…"
                      : varita.phase === "dragging"
                        ? "Soltá el mouse para detectar el lote dentro del rectángulo."
                        : "Hacé clic y arrastrá para encerrar el lote. Luego ajustá los puntos clave del polígono si es necesario."}
                </Callout.Text>
              </Callout.Root>
            </Box>
          )}

          {/*
            Overlay del bounding box durante el drag. Vive como un <div>
            absoluto encima del canvas del mapa para mantener feedback a
            60fps sin tener que re-renderizar el mapa entero como source
            GeoJSON. `pointerEvents: none` para que el rect no robe los
            eventos de mousemove/mouseup que el hook necesita.
          */}
          {varita.dragBox && (
            <div
              aria-hidden
              style={{
                position: "absolute",
                left: varita.dragBox.x,
                top: varita.dragBox.y,
                width: varita.dragBox.width,
                height: varita.dragBox.height,
                border: "2px dashed var(--amber-9)",
                background: "color-mix(in srgb, var(--amber-9) 12%, transparent)",
                pointerEvents: "none",
                zIndex: 15,
                boxShadow: "0 0 0 1px rgba(0,0,0,0.18)",
              }}
            />
          )}

          {varita.errorMessage && (
            <Box
              position="absolute"
              top="4"
              left="50%"
              className="z-20 pointer-events-auto -translate-x-1/2"
              style={{ maxWidth: "26rem", width: "calc(100% - 2rem)" }}
            >
              <Callout.Root size="1" color="red" role="alert">
                <Callout.Icon>
                  <Sparkles size={14} aria-hidden />
                </Callout.Icon>
                <Callout.Text>{varita.errorMessage}</Callout.Text>
                <Flex gap="2" mt="2" wrap="wrap">
                  <Button
                    type="button"
                    size="1"
                    variant="soft"
                    color="gray"
                    onClick={varita.clearError}
                  >
                    Cerrar
                  </Button>
                  <Button
                    type="button"
                    size="1"
                    variant="solid"
                    color="iris"
                    onClick={() => void varita.activate()}
                  >
                    Reintentar
                  </Button>
                  <Button
                    type="button"
                    size="1"
                    variant="soft"
                    color="jade"
                    onClick={() => {
                      varita.clearError();
                      handleStartDrawing();
                    }}
                  >
                    Dibujar a mano
                  </Button>
                </Flex>
              </Callout.Root>
            </Box>
          )}
        </Box>

        {analysisError && (
          <Box
            position="absolute"
            bottom="6"
            left="50%"
            className="z-10 pointer-events-none -translate-x-1/2"
            style={{ maxWidth: "28rem", width: "calc(100% - 2rem)" }}
          >
            <Callout.Root color="red" size="2" role="alert">
              <Callout.Text>{analysisError}</Callout.Text>
            </Callout.Root>
          </Box>
        )}

        {showMapToolbar && (
          <Box
            position="absolute"
            bottom="6"
            left="0"
            right="0"
            style={{ zIndex: 20, pointerEvents: "none" }}
          >
            <Flex
              justify="center"
              gap="3"
              px="4"
              wrap="wrap"
              style={{ pointerEvents: "auto" }}
            >
              <Button
                type="button"
                radius="full"
                size="3"
                variant="solid"
                color="jade"
                disabled={isDrawing}
                onClick={handleStartDrawing}
              >
                {isDrawing
                  ? "Dibujando…"
                  : polygon
                    ? "Redibujar lote"
                    : "Dibujar lote"}
              </Button>
              {isDrawing && (
                <Button
                  type="button"
                  radius="full"
                  size="3"
                  variant="solid"
                  color="amber"
                  disabled={!canClose}
                  onClick={handleCloseContour}
                >
                  Cerrar contorno
                </Button>
              )}
              {polygon && (
                <Button
                  type="button"
                  radius="full"
                  size="3"
                  variant="soft"
                  color="gray"
                  onClick={handleClear}
                >
                  Borrar
                </Button>
              )}
              <Button
                type="button"
                radius="full"
                size="3"
                variant="solid"
                color="grass"
                disabled={!polygon || isAnalyzing}
                onClick={handleOpenCrearDialog}
              >
                Confirmar lote
              </Button>
            </Flex>
          </Box>
        )}

        {isAnalyzing && (
          <Box
            position="absolute"
            bottom="6"
            left="0"
            right="0"
            className="z-10 pointer-events-none"
          >
            <Flex justify="center" px="4">
              <Callout.Root size="2" color="jade" className="pointer-events-none">
                <Callout.Icon>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                </Callout.Icon>
                <Callout.Text>Analizando historial satelital…</Callout.Text>
              </Callout.Root>
            </Flex>
          </Box>
        )}
      </Flex>

      {panelOpen && analysis && (
        <Box
          style={{ minHeight: 0, minWidth: 0, borderTop: "1px solid var(--gray-a6)" }}
          className="lg:border-t-0 lg:border-l"
        >
          <DashboardLote
            data={analysis}
            onClear={handleClearLote}
            ndviDataStatus={ndviLayer.dataStatus.phase}
            realHealthScore={ndviLayer.healthScore}
            ndviSerie={ndviSerie.serie}
            ndviSerieStatus={ndviSerie.status}
            ndviPeriod={ndviPeriod}
            onNdviPeriodChange={setNdviPeriod}
            onToggleLayer={polygon ? handleToggleNDVI : undefined}
            layerVisible={ndviEnabled}
            incendiosStatus={incendios.status.phase}
            incendiosReales={incendiosClusters}
            inundacionesStatus={analisis.status.phase}
            inundacionesReales={analisis.data?.inundaciones ?? null}
            elevacion={analisis.data?.elevacion ?? null}
            analisisCacheado={analisis.data?.cacheado ?? null}
            analisisActualizadoEn={analisis.data?.actualizadoEn ?? null}
            analisisRefreshing={analisis.isRefreshing}
            onRefreshAnalysis={handleRefreshAnalysis}
            loteGuardado
            onRenameLote={handleRenameLote}
            onDeleteLote={handleDeleteLote}
          />
        </Box>
      )}

      <CrearLoteDialog
        open={crearDialogOpen}
        onOpenChange={setCrearDialogOpen}
        nombreSugerido={nombreSugerido}
        hectareas={areaHectareasPoligono}
        creating={isAnalyzing}
        onConfirm={(values) => void handleConfirm(values)}
        onAuthError={handleAuthError}
      />
    </Grid>
  );
}
