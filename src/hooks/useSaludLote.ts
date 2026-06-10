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
  /**
   * `ObjectURL` del PNG raster NDVI de Sentinel Hub. Se mantiene vivo mientras
   * el hook esté montado (para poder incrustarlo en el reporte PDF) y se
   * revoca en el cleanup. `null` hasta resolver o si falla.
   */
  ndviImgUrl: string | null;
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
  const [ndviImgUrl, setNdviImgUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);

  useEffect(() => {
    if (!loteId) {
      setPhase("idle");
      setHealthScore(null);
      setBaseSerie([]);
      setNdviImgUrl(null);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;
    // Guardamos el ObjectURL vivo de esta corrida para revocarlo en el cleanup
    // (al cambiar de lote o desmontar), evitando fugas sin matar la referencia
    // que el reporte PDF necesita mientras la ficha está montada.
    let activeUrl: string | null = null;

    setPhase("loading");
    setError(null);
    setIsAuthError(false);

    getSaludAnalisis({ loteId, signal: controller.signal })
      .then(({ objectUrl, stats, healthScore: score }) => {
        if (cancelled) {
          // Llegó tarde (lote cambió/desmontó): liberamos y salimos.
          revokeNDVIObjectURL(objectUrl);
          return;
        }
        activeUrl = objectUrl;
        setNdviImgUrl(objectUrl);
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
        setNdviImgUrl(null);
        setPhase("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
      if (activeUrl) revokeNDVIObjectURL(activeUrl);
    };
  }, [loteId]);

  return { phase, healthScore, baseSerie, ndviImgUrl, error, isAuthError };
}
