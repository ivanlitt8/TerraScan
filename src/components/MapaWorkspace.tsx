"use client";

import DashboardLote from "@/components/DashboardLote";
import LocationSearch from "@/components/LocationSearch";
import Map, { type MapHandle } from "@/components/Map";
import PanelLotesList from "@/components/PanelLotesList";
import type { FlyToLocation } from "@/lib/locationSearch";
import { buildMockHistoricalAnalysis } from "@/lib/mockLoteAnalysis";
import { analyzeLote, ApiServiceError } from "@/services";
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
import { Layers, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MapaWorkspace() {
  const router = useRouter();
  const mapRef = useRef<MapHandle>(null);
  const [polygon, setPolygon] = useState<Feature<Polygon> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LoteAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [isLotesPanelOpen, setIsLotesPanelOpen] = useState(false);

  const panelOpen = Boolean(analysis);
  const showMapToolbar = !panelOpen && !isAnalyzing;

  const resetAnalysis = useCallback(() => {
    setAnalysis(null);
    setAnalysisError(null);
    setIsAnalyzing(false);
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

  const handleGoTo = useCallback((location: FlyToLocation) => {
    mapRef.current?.flyTo({
      lng: location.lng,
      lat: location.lat,
      zoom: location.zoom,
      label: location.label,
    });
  }, []);

  const handleStartDrawing = () => {
    setConfirmed(false);
    resetAnalysis();
    mapRef.current?.unlockEditing();
    mapRef.current?.clearPolygon();
    requestAnimationFrame(() => {
      mapRef.current?.startDrawing();
    });
  };

  const handleCloseContour = () => {
    mapRef.current?.closePolygon();
  };

  const handleClear = () => {
    mapRef.current?.clearPolygon();
    setConfirmed(false);
    resetAnalysis();
  };

  const handleConfirm = async () => {
    if (!polygon || isAnalyzing) return;
    setConfirmed(true);
    setAnalysisError(null);
    setAnalysis(null);
    setIsAnalyzing(true);
    mapRef.current?.lockEditing();

    // Mientras no exista UI para nombrar el lote, generamos un nombre por defecto
    // fechado. El backend exige `nombre` (1–120 chars) en el DTO `AnalyzeLoteDto`.
    const nombre = `Lote — ${new Date().toLocaleString("es-AR", {
      dateStyle: "short",
      timeStyle: "short",
    })}`;

    try {
      const lote = await analyzeLote({ nombre, poligonoGeoJSON: polygon });

      // Combinamos los campos REALES del backend (id de Supabase, hectáreas
      // calculadas con Turf, createdAt) con el mock histórico (NDVI + alertas)
      // que el backend todavía no calcula — ver pendientes en back/HISTORIAL.md.
      const historico = buildMockHistoricalAnalysis();
      setAnalysis({
        id: lote.id,
        nombre: lote.nombre,
        hectareas: lote.areaHectareas,
        procesadoEn: lote.createdAt,
        ...historico,
      });
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

  const handleLoteFromPanel = useCallback((lote: LoteBackendResponse) => {
    mapRef.current?.clearPolygon();
    mapRef.current?.showSavedPolygon(lote.poligonoGeoJSON);
  }, []);

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
          />

          <PanelLotesList
            isOpen={isLotesPanelOpen}
            onClose={() => setIsLotesPanelOpen(false)}
            onLoteSelect={handleLoteFromPanel}
            onAuthError={handleAuthError}
          />

          {!isLotesPanelOpen && (
            <Box
              position="absolute"
              left="4"
              top="4"
              className="pointer-events-auto z-20"
            >
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
                onClick={() => void handleConfirm()}
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
          <DashboardLote data={analysis} onClear={handleClearLote} />
        </Box>
      )}
    </Grid>
  );
}
