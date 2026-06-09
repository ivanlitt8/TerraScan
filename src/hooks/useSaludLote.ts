"use client";

import {
  ApiServiceError,
  getSaludAnalisis,
  revokeNDVIObjectURL,
  type HealthScoreSummary,
  type NDVIStatPoint,
} from "@/services";
import { useEffect, useState } from "react";

export type SaludLotePhase = "idle" | "loading" | "ready" | "error";

export type UseSaludLoteReturn = {
  phase: SaludLotePhase;
  /** Resumen de salud actual (score, categoría, NDVI medio). `null` hasta resolver. */
  healthScore: HealthScoreSummary | null;
  /** Serie NDVI de la ventana base (30 días) para alimentar el gráfico. */
  baseSerie: NDVIStatPoint[];
  error: string | null;
  isAuthError: boolean;
};

/**
 * Score de salud + serie NDVI base de un lote, **desacoplado del mapa**.
 *
 * A diferencia de `useNDVILayer` (que necesita una instancia de `maplibregl.Map`
 * para pintar el raster), este hook solo consume los datos numéricos de
 * `GET /api/lotes/:id/salud-analisis`. El PNG que igual devuelve el endpoint se
 * revoca al instante: la ficha no dibuja el raster (su mini-mapa es satelital
 * read-only), así evitamos fugas de `ObjectURL`.
 *
 * Estado independiente del resto de la ficha: es la única pieza que pega a
 * Sentinel Hub en vivo, así que un fallo acá (e.g. credencial vencida) no debe
 * tumbar los bloques que cargan desde caché local.
 */
export function useSaludLote(loteId: string | null): UseSaludLoteReturn {
  const [phase, setPhase] = useState<SaludLotePhase>("idle");
  const [healthScore, setHealthScore] = useState<HealthScoreSummary | null>(
    null,
  );
  const [baseSerie, setBaseSerie] = useState<NDVIStatPoint[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);

  useEffect(() => {
    if (!loteId) {
      setPhase("idle");
      setHealthScore(null);
      setBaseSerie([]);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setPhase("loading");
    setError(null);
    setIsAuthError(false);

    getSaludAnalisis({ loteId, signal: controller.signal })
      .then(({ objectUrl, stats, healthScore: score }) => {
        // La ficha no pinta el raster: liberamos el blob apenas llega.
        revokeNDVIObjectURL(objectUrl);
        if (cancelled) return;
        setHealthScore(score);
        setBaseSerie(
          [...stats].sort((a, b) => a.fecha.localeCompare(b.fecha)),
        );
        setPhase("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        const isAbort =
          cause instanceof DOMException && cause.name === "AbortError";
        if (isAbort) return;
        const apiError = cause instanceof ApiServiceError ? cause : null;
        setIsAuthError(apiError?.status === 401);
        setError(
          apiError?.message ?? "No se pudo calcular la salud del lote.",
        );
        setHealthScore(null);
        setBaseSerie([]);
        setPhase("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loteId]);

  return { phase, healthScore, baseSerie, error, isAuthError };
}
