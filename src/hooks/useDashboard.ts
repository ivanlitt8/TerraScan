"use client";

import { ApiServiceError, fetchDashboard } from "@/services";
import type { DashboardResponse } from "@/services";
import { useCallback, useEffect, useState } from "react";

type DashboardPhase = "loading" | "ready" | "error";

export type UseDashboardReturn = {
  phase: DashboardPhase;
  data: DashboardResponse | null;
  error: string | null;
  /** `true` cuando el fallo fue 401 (sesión expirada) → redirigir a login. */
  isAuthError: boolean;
  /** Re-dispara la petición (botón "Reintentar"). */
  reload: () => void;
};

/**
 * Carga el dashboard agregado del usuario (`GET /api/analisis/dashboard`).
 *
 * Usa un flag `cancelled` (en vez de `AbortController`) para descartar
 * respuestas viejas si el componente se desmonta o se vuelve a disparar:
 * `authenticatedFetch` traduce el abort a un error genérico, así que el flag
 * es más limpio para no pintar un error fantasma al desmontar.
 */
export function useDashboard(): UseDashboardReturn {
  const [phase, setPhase] = useState<DashboardPhase>("loading");
  const [data, setData] = useState<DashboardResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isAuthError, setIsAuthError] = useState(false);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  useEffect(() => {
    let cancelled = false;

    setPhase("loading");
    setError(null);
    setIsAuthError(false);

    fetchDashboard()
      .then((response) => {
        if (cancelled) return;
        setData(response);
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

  return { phase, data, error, isAuthError, reload };
}
