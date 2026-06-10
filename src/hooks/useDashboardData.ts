"use client";

import {
  ApiServiceError,
  fetchDashboard,
  fetchEstablecimientos,
} from "@/services";
import type { DashboardResponse, EstablecimientoListItem } from "@/services";
import { useCallback, useEffect, useState } from "react";

type Phase = "loading" | "ready" | "error";

export type UseDashboardDataReturn = {
  phase: Phase;
  data: DashboardResponse | null;
  establecimientos: EstablecimientoListItem[];
  error: string | null;
  /** `true` cuando el fallo fue 401 (sesión expirada) → redirigir a login. */
  isAuthError: boolean;
  /** Re-dispara ambas peticiones (botón "Reintentar"). */
  reload: () => void;
};

/**
 * Carga en paralelo el dashboard agregado (`GET /api/analisis/dashboard`) y la
 * lista de establecimientos del usuario (`GET /api/establecimientos`).
 *
 * El dashboard ya trae por lote `establecimientoId`/`score`, así que el filtro
 * global y los gráficos se recalculan 100% en cliente; la lista de
 * establecimientos sólo alimenta el selector de la cabecera (incluye campos sin
 * lotes). Una sola fase/loading/error coherente para los dos fetch.
 */
export function useDashboardData(): UseDashboardDataReturn {
  const [phase, setPhase] = useState<Phase>("loading");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [establecimientos, setEstablecimientos] = useState<
    EstablecimientoListItem[]
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    setPhase("loading");
    setError(null);
    setIsAuthError(false);

    Promise.all([fetchDashboard(), fetchEstablecimientos()])
      .then(([dashboard, campos]) => {
        if (cancelled) return;
        setData(dashboard);
        setEstablecimientos(campos);
        setPhase("ready");
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        const apiError = err instanceof ApiServiceError ? err : null;
        setIsAuthError(apiError?.status === 401);
        setError(
          apiError?.message ?? "No se pudo cargar el dashboard. Reintentá.",
        );
        setPhase("error");
      });

    return () => {
      cancelled = true;
    };
  }, [nonce]);

  return { phase, data, establecimientos, error, isAuthError, reload };
}
