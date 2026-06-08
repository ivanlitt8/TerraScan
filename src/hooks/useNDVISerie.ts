"use client";

import { getSaludStats, type NDVIStatPoint } from "@/services";
import { useEffect, useState } from "react";

/**
 * Hook que resuelve la serie temporal NDVI **del gráfico** del dashboard,
 * desacoplada del score y de la capa de mapa.
 *
 * Decisión de diseño (pedido del usuario):
 *  - El score de salud y la capa raster siguen anclados a la ventana
 *    "actual" (30 días) que ya trae `useNDVILayer` vía `salud-analisis`.
 *  - El gráfico, en cambio, puede mostrar períodos más largos (3/6/12 meses)
 *    sin mover ese número ni re-renderizar el raster (que es lo caro).
 *
 * Optimización: cuando el período seleccionado es el default (30 días), la
 * serie del `salud-analisis` ya está disponible (`baseSerie`), así que la
 * reusamos y **no** disparamos una segunda llamada a Sentinel. Solo pedimos
 * `salud-stats` cuando el usuario estira el rango.
 */

/** Identificadores de los períodos seleccionables del gráfico. */
export type NDVIPeriodId = "30d" | "90d" | "180d" | "365d";

export type NDVIPeriodOption = {
  id: NDVIPeriodId;
  /** Etiqueta corta para el control segmentado. */
  label: string;
  /** Etiqueta larga para el subtítulo del gráfico (`últimos 30 días`, …). */
  rangoLabel: string;
  /** Días hacia atrás desde hoy que abarca el período. */
  dias: number;
};

/** Catálogo de períodos. El primero es el default (coincide con score/capa). */
export const NDVI_PERIODS: readonly NDVIPeriodOption[] = [
  { id: "30d", label: "30 d", rangoLabel: "últimos 30 días", dias: 30 },
  { id: "90d", label: "3 m", rangoLabel: "últimos 3 meses", dias: 90 },
  { id: "180d", label: "6 m", rangoLabel: "últimos 6 meses", dias: 180 },
  { id: "365d", label: "1 a", rangoLabel: "último año", dias: 365 },
] as const;

/** Período por defecto: la misma ventana que usan el score y la capa. */
export const NDVI_DEFAULT_PERIOD: NDVIPeriodId = "30d";

type SerieStatus = "idle" | "loading" | "ready" | "error";

export type UseNDVISerieOptions = {
  loteId: string | null;
  period: NDVIPeriodId;
  /** Serie ya pedida por `salud-analisis` (ventana de 30 días). */
  baseSerie: NDVIStatPoint[];
  /** Estado del fetch base (`salud-analisis`). */
  baseStatus: SerieStatus;
};

export type UseNDVISerieReturn = {
  serie: NDVIStatPoint[];
  status: SerieStatus;
};

/** `[from, to]` en `YYYY-MM-DD` (UTC) para los últimos `dias` días. */
function rangoDesdeDias(dias: number): { from: string; to: string } {
  const hoy = new Date();
  const desde = new Date(hoy);
  desde.setUTCDate(hoy.getUTCDate() - dias);
  return {
    from: desde.toISOString().slice(0, 10),
    to: hoy.toISOString().slice(0, 10),
  };
}

export function useNDVISerie(
  options: UseNDVISerieOptions,
): UseNDVISerieReturn {
  const { loteId, period, baseSerie, baseStatus } = options;

  const [serie, setSerie] = useState<NDVIStatPoint[]>([]);
  const [status, setStatus] = useState<SerieStatus>("idle");

  const isDefault = period === NDVI_DEFAULT_PERIOD;

  useEffect(() => {
    // Período default: reusamos la serie del `salud-analisis` (ya pedida),
    // así no duplicamos la llamada a Sentinel en el caso más común.
    if (isDefault) return;

    if (!loteId) {
      setSerie([]);
      setStatus("idle");
      return;
    }

    const controller = new AbortController();
    let cancelled = false;

    const dias =
      NDVI_PERIODS.find((p) => p.id === period)?.dias ?? 30;
    const { from, to } = rangoDesdeDias(dias);

    setStatus("loading");

    (async () => {
      try {
        const data = await getSaludStats({
          loteId,
          from,
          to,
          signal: controller.signal,
        });
        if (cancelled) return;
        setSerie(
          [...data].sort((a, b) => a.fecha.localeCompare(b.fecha)),
        );
        setStatus("ready");
      } catch (cause) {
        if (cancelled) return;
        const isAbort =
          cause instanceof DOMException && cause.name === "AbortError";
        if (isAbort) return;
        console.error("[useNDVISerie] ✕", cause);
        setSerie([]);
        setStatus("error");
      }
    })();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [isDefault, loteId, period]);

  // Para el período default devolvemos la serie/estado del fetch base; para
  // el resto, el estado local de este hook.
  if (isDefault) {
    return { serie: baseSerie, status: baseStatus };
  }
  return { serie, status };
}
