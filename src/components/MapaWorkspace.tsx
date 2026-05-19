"use client";

import DashboardLote from "@/components/DashboardLote";
import LocationSearch from "@/components/LocationSearch";
import Map, { type MapHandle } from "@/components/Map";
import type { FlyToLocation } from "@/lib/locationSearch";
import { analyzeLote, ApiServiceError } from "@/services";
import type { LoteAnalysisResult } from "@/types/loteAnalysis";
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
} from "@radix-ui/themes";
import type { Feature, Polygon } from "geojson";
import { Loader2 } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MapaWorkspace() {
  const mapRef = useRef<MapHandle>(null);
  const [polygon, setPolygon] = useState<Feature<Polygon> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canClose, setCanClose] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<LoteAnalysisResult | null>(null);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

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

    try {
      const result = await analyzeLote(polygon);
      setAnalysis(result);
    } catch (error) {
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
  };

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
