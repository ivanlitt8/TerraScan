"use client";

import {
  ApiServiceError,
  fetchAnalisisEspacial,
  fetchIncendiosByLote,
  fetchLoteById,
  type AnalisisEspacialResponse,
  type IncendioResponse,
} from "@/services";
import type { LoteBackendResponse } from "@/types/loteAnalysis";
import { useCallback, useEffect, useState } from "react";

type LoteDetallePhase = "loading" | "ready" | "error";

export type UseLoteDetalleReturn = {
  phase: LoteDetallePhase;
  lote: LoteBackendResponse | null;
  analisis: AnalisisEspacialResponse | null;
  incendios: IncendioResponse[] | null;
  error: string | null;
  isAuthError: boolean;
  isNotFound: boolean;
  reload: () => void;
  /** Aplica un nuevo nombre al lote en memoria (tras un rename exitoso). */
  applyNombre: (nombre: string) => void;
};

/**
 * Carga en paralelo el lote, su análisis GEE cacheado y el historial completo
 * de focos FIRMS (rango por defecto del backend: últimos 5 años) para la ficha
 * de detalle. El clustering por evento queda a cargo del consumidor.
 */
export function useLoteDetalle(loteId: string | null): UseLoteDetalleReturn {
  const [phase, setPhase] = useState<LoteDetallePhase>("loading");
  const [lote, setLote] = useState<LoteBackendResponse | null>(null);
  const [analisis, setAnalisis] = useState<AnalisisEspacialResponse | null>(
    null,
  );
  const [incendios, setIncendios] = useState<IncendioResponse[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [isNotFound, setIsNotFound] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const applyNombre = useCallback((nombre: string) => {
    setLote((prev) => (prev ? { ...prev, nombre } : prev));
  }, []);

  useEffect(() => {
    if (!loteId) {
      setPhase("error");
      setError("Identificador de lote inválido.");
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    setPhase("loading");
    setError(null);
    setIsAuthError(false);
    setIsNotFound(false);
    setLote(null);
    setAnalisis(null);
    setIncendios(null);

    Promise.all([
      fetchLoteById(loteId),
      fetchAnalisisEspacial(loteId, { signal: controller.signal }),
      fetchIncendiosByLote(loteId, { signal: controller.signal }),
    ])
      .then(([loteData, analisisData, incendiosData]) => {
        if (cancelled) return;
        setLote(loteData);
        setAnalisis(analisisData);
        setIncendios(incendiosData);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        const apiError = err instanceof ApiServiceError ? err : null;
        setIsAuthError(apiError?.status === 401);
        setIsNotFound(apiError?.status === 404);
        setError(
          apiError?.message ??
            "No se pudo cargar la ficha del lote. Reintentá.",
        );
        setPhase("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loteId, nonce]);

  return {
    phase,
    lote,
    analisis,
    incendios,
    error,
    isAuthError,
    isNotFound,
    reload,
    applyNombre,
  };
}
