"use client";

/**
 * Hook que dispara `GET /api/gee/analisis/:loteId` y mantiene el estado
 * (loading / data / error) listo para conectar a la UI más adelante.
 *
 * Estado actual: **no consumido por la UI todavía**. Sólo hace logging
 * verbose por consola (request en `[fetchAnalisisEspacial]`, resultado aquí
 * en `[useAnalisisEspacial]`) para validar el endpoint end-to-end. El hook
 * deja todo cableado para que, cuando se decida mostrarlo, baste con leer
 * `state.data` desde el dashboard.
 *
 * Mismo patrón que `useIncendios`: AbortController para descartar respuestas
 * viejas, y `isAuthError` para enganchar al redirect de sesión expirada.
 */

import {
  ApiServiceError,
  fetchAnalisisEspacial,
  type AnalisisEspacialResponse,
} from "@/services";
import { useCallback, useEffect, useRef, useState } from "react";

export type UseAnalisisEspacialOptions = {
  /**
   * UUID del lote. Si es `null`/`undefined` el hook no dispara nada
   * (queda en `phase: "idle"`). Útil para encadenar a `analysis?.id`.
   */
  loteId: string | null;
};

export type UseAnalisisEspacialStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; data: AnalisisEspacialResponse }
  | { phase: "error"; message: string; isAuthError: boolean };

export type RefreshOptions = {
  /** Si es `true`, pide `?force=true` para ignorar la caché del backend. */
  force?: boolean;
};

export type UseAnalisisEspacialReturn = {
  status: UseAnalisisEspacialStatus;
  /** Atajo: los datos si están listos, `null` si no. */
  data: AnalisisEspacialResponse | null;
  /** Fuerza un re-fetch. Pasar `{ force: true }` para ignorar la caché. */
  refresh: (options?: RefreshOptions) => void;
  /**
   * `true` mientras se recalcula **teniendo ya datos previos** (refresh manual),
   * para distinguirlo de la carga inicial (que muestra skeletons).
   */
  isRefreshing: boolean;
};

export function useAnalisisEspacial(
  options: UseAnalisisEspacialOptions,
): UseAnalisisEspacialReturn {
  const { loteId } = options;

  const [status, setStatus] = useState<UseAnalisisEspacialStatus>({
    phase: "idle",
  });
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  // El `force` del próximo fetch se consume vía ref para no re-disparar el
  // efecto por sí mismo (sólo `refreshToken` lo dispara).
  const forceRef = useRef(false);
  // Último `loteId` procesado: nos deja distinguir "cambio de lote" (mostrar
  // skeleton, nunca datos viejos de otro lote) de "refresh del mismo lote"
  // (mantener el contenido visible mientras llega lo fresco).
  const prevLoteIdRef = useRef<string | null>(null);

  const refresh = useCallback((options?: RefreshOptions) => {
    forceRef.current = options?.force ?? false;
    setRefreshToken((n) => n + 1);
  }, []);

  useEffect(() => {
    if (!loteId) {
      setStatus({ phase: "idle" });
      setIsRefreshing(false);
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const force = forceRef.current;
    forceRef.current = false;
    const isSameLote = prevLoteIdRef.current === loteId;
    prevLoteIdRef.current = loteId;

    if (isSameLote) {
      // Refresh del mismo lote: si ya hay datos, no los borramos con un
      // skeleton; marcamos `isRefreshing` y dejamos el contenido visible.
      setIsRefreshing(true);
      setStatus((prev) => (prev.phase === "ready" ? prev : { phase: "loading" }));
    } else {
      // Lote nuevo: skeleton limpio, nunca datos del lote anterior.
      setIsRefreshing(false);
      setStatus({ phase: "loading" });
    }
    console.info(
      "[useAnalisisEspacial] disparando fetch para loteId",
      loteId,
      force ? "(force)" : "",
    );

    (async () => {
      try {
        const data = await fetchAnalisisEspacial(loteId, {
          signal: controller.signal,
          force,
        });
        if (cancelled) return;

        console.info(
          "[useAnalisisEspacial] ✓ análisis recibido para lote",
          loteId,
          {
            elevacion: data.elevacion,
            eventosInundacion: data.eventosInundacion,
            cacheado: data.cacheado,
          },
        );

        setStatus({ phase: "ready", data });
        setIsRefreshing(false);
      } catch (cause) {
        if (cancelled) return;

        const isAbort =
          cause instanceof DOMException && cause.name === "AbortError";
        if (isAbort) return;
        setIsRefreshing(false);

        const message =
          cause instanceof ApiServiceError
            ? cause.message
            : cause instanceof Error
              ? cause.message
              : "No se pudo cargar el análisis espacial.";
        const isAuthError =
          cause instanceof ApiServiceError && cause.status === 401;

        console.error("[useAnalisisEspacial] ✕", cause);
        setStatus({ phase: "error", message, isAuthError });
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [loteId, refreshToken]);

  const data = status.phase === "ready" ? status.data : null;

  return { status, data, refresh, isRefreshing };
}
