"use client";

import Map, { type MapHandle } from "@/components/Map";
import type { Feature, Polygon } from "geojson";
import { useCallback, useEffect, useRef, useState } from "react";

export default function MapaWorkspace() {
  const mapRef = useRef<MapHandle>(null);
  const [polygon, setPolygon] = useState<Feature<Polygon> | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canClose, setCanClose] = useState(false);

  const handlePolygonChange = useCallback((feature: Feature<Polygon> | null) => {
    setPolygon(feature);
    if (feature) {
      setConfirmed(false);
      setIsDrawing(false);
    }
  }, []);

  const handleStartDrawing = () => {
    setConfirmed(false);
    mapRef.current?.clearPolygon();
    mapRef.current?.startDrawing();
  };

  const handleCloseContour = () => {
    mapRef.current?.closePolygon();
  };

  const handleClear = () => {
    mapRef.current?.clearPolygon();
    setConfirmed(false);
  };

  const handleConfirm = () => {
    if (!polygon) return;
    setConfirmed(true);
    mapRef.current?.lockEditing();
  };

  const handleStartOver = () => {
    setConfirmed(false);
    mapRef.current?.clearPolygon();
  };

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
    <main className="relative h-dvh w-full overflow-hidden">
      <Map
        ref={mapRef}
        className="h-full w-full"
        onPolygonChange={handlePolygonChange}
        onDrawModeChange={setIsDrawing}
        onCanCloseChange={setCanClose}
      />

      <div className="pointer-events-none absolute inset-x-0 top-4 z-10 flex justify-center px-4">
        <div className="pointer-events-auto max-w-lg rounded-lg bg-black/75 px-4 py-3 text-sm text-white shadow-lg backdrop-blur-sm">
          {confirmed ? (
            <p>
              Lote confirmado. El análisis satelital se conectará en el próximo
              paso. Usá <strong>Empezar de nuevo</strong> para delimitar otro
              campo.
            </p>
          ) : isDrawing ? (
            <p>
              <strong>Dibujando:</strong> marcá cada vértice del campo. Con al
              menos 3 puntos, pulsá <strong>Cerrar contorno</strong>, la tecla{" "}
              <strong>Enter</strong> o el <strong>primer punto</strong> del
              polígono.
            </p>
          ) : polygon ? (
            <p>
              Contorno cerrado. Revisá el área en el mapa y pulsá{" "}
              <strong>Confirmar lote</strong> para continuar.
            </p>
          ) : (
            <p>
              Pulsá <strong>Dibujar lote</strong> y marcá el contorno de tu
              campo en el mapa.
            </p>
          )}
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-6 z-10 flex flex-wrap justify-center gap-3 px-4">
        {confirmed ? (
          <button
            type="button"
            onClick={handleStartOver}
            className="pointer-events-auto rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-sky-500"
          >
            Empezar de nuevo
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={handleStartDrawing}
              disabled={isDrawing}
              className="pointer-events-auto rounded-full bg-sky-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-600"
            >
              {isDrawing
                ? "Dibujando…"
                : polygon
                  ? "Redibujar lote"
                  : "Dibujar lote"}
            </button>
            {isDrawing && (
              <button
                type="button"
                onClick={handleCloseContour}
                disabled={!canClose}
                className="pointer-events-auto rounded-full bg-amber-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-amber-500 disabled:cursor-not-allowed disabled:bg-zinc-600"
              >
                Cerrar contorno
              </button>
            )}
            {polygon && (
              <button
                type="button"
                onClick={handleClear}
                className="pointer-events-auto rounded-full border border-white/30 bg-black/60 px-5 py-3 text-sm font-semibold text-white shadow-lg backdrop-blur-sm hover:bg-black/80"
              >
                Borrar
              </button>
            )}
            <button
              type="button"
              disabled={!polygon}
              onClick={handleConfirm}
              className="pointer-events-auto rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-zinc-600 disabled:text-zinc-400"
            >
              Confirmar lote
            </button>
          </>
        )}
      </div>
    </main>
  );
}
