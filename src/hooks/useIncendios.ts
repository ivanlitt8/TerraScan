"use client";

/**
 * Hook que dispara `GET /api/lotes/:id/incendios` y mantiene el estado
 * (loading / data / error) listo para conectar a la UI más adelante.
 *
 * Estado actual: **no consumido por la UI todavía**. Mientras se valida
 * end-to-end el endpoint en producción, el `DashboardLote` sigue
 * mostrando los datos mock de alertas. El hook deja todo cableado para
 * que cuando se decida quitar el mock, solo haya que leer
 * `state.data` desde el dashboard sin reescribir la integración.
 *
 * También hace logging verbose por consola para tener feedback inmediato
 * mientras se desarrolla: cada llamada y cada respuesta se ven en
 * `[fetchIncendiosByLote]` y aquí en `[useIncendios]`.
 */

import {
  ApiServiceError,
  fetchIncendiosByLote,
  type IncendioResponse,
} from "@/services";
import { useCallback, useEffect, useState } from "react";

export type UseIncendiosOptions = {
  /**
   * UUID del lote. Si es `null`/`undefined` el hook no dispara nada
   * (queda en `phase: "idle"`). Útil para encadenar a `analysis?.id`
   * que es `null` hasta que se confirma un lote.
   */
  loteId: string | null;
  /** Rango temporal opcional. Default backend: últimos 5 años. */
  from?: string;
  to?: string;
};

export type UseIncendiosStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; data: IncendioResponse[] }
  | { phase: "error"; message: string; isAuthError: boolean };

export type UseIncendiosReturn = {
  status: UseIncendiosStatus;
  /** Atajo: los datos si están listos, `null` si no. */
  data: IncendioResponse[] | null;
  /** Fuerza un re-fetch (e.g. tras cambiar el rango temporal). */
  refresh: () => void;
};

export function useIncendios(options: UseIncendiosOptions): UseIncendiosReturn {
  const { loteId, from, to } = options;

  const [status, setStatus] = useState<UseIncendiosStatus>({ phase: "idle" });
  const [refreshToken, setRefreshToken] = useState(0);

  const refresh = useCallback(() => {
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!loteId) {
      setStatus({ phase: "idle" });
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    setStatus({ phase: "loading" });
    console.info("[useIncendios] disparando fetch para loteId", loteId, {
      from,
      to,
    });

    (async () => {
      try {
        const data = await fetchIncendiosByLote(loteId, {
          from,
          to,
          signal: controller.signal,
        });
        if (cancelled) return;

        console.info(
          "[useIncendios] ✓ recibidas",
          data.length,
          "detecciones para lote",
          loteId,
        );

        setStatus({ phase: "ready", data });
      } catch (cause) {
        if (cancelled) return;

        const isAbort =
          cause instanceof DOMException && cause.name === "AbortError";
        if (isAbort) return;

        const message =
          cause instanceof ApiServiceError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "No se pudieron cargar los incendios.";
        const isAuthError =
          cause instanceof ApiServiceError && cause.status === 401;

        console.error("[useIncendios] ✕", cause);
        setStatus({ phase: "error", message, isAuthError });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loteId, from, to, refreshToken]);

  const data = status.phase === "ready" ? status.data : null;

  return { status, data, refresh };
}
