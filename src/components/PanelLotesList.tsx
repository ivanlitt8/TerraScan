"use client";

import { ApiServiceError, fetchLoteById, fetchLotes } from "@/services";
import type {
  LoteBackendResponse,
  LoteListItem,
} from "@/types/loteAnalysis";
import { Callout, IconButton, ScrollArea } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  FileText,
  Layers,
  Loader2,
  MapPin,
  RefreshCw,
  X,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";

const PANEL_WIDTH = 360;

type PanelLotesListProps = {
  isOpen: boolean;
  onClose: () => void;
  /**
   * Se dispara cuando el usuario clickea un lote y `fetchLoteById` resolvió.
   * El padre normalmente ajusta la cámara del mapa al polígono recibido.
   */
  onLoteSelect: (lote: LoteBackendResponse) => void;
  /**
   * Notifica el resultado del fetch al padre para evitar que duplique llamadas.
   * Útil para señalizar 401 → redirect al login desde el contenedor.
   */
  onAuthError?: () => void;
};

const dateFormatter = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

const hectareFormatter = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 2,
  minimumFractionDigits: 0,
});

function formatHectareas(value: number): string {
  return `${hectareFormatter.format(value)} ha`;
}

function formatFecha(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return dateFormatter.format(date);
}

const panelVariants = {
  hidden: { x: -PANEL_WIDTH - 24, opacity: 0 },
  visible: {
    x: 0,
    opacity: 1,
    transition: { type: "spring" as const, stiffness: 220, damping: 28 },
  },
  exit: {
    x: -PANEL_WIDTH - 24,
    opacity: 0,
    transition: { duration: 0.22, ease: "easeIn" as const },
  },
};

const listVariants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.05, delayChildren: 0.08 },
  },
};

const itemVariants = {
  hidden: { opacity: 0, y: 10 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.28, ease: "easeOut" as const },
  },
};

type FetchStatus =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready"; lotes: LoteListItem[] }
  | { phase: "error"; message: string; isAuth: boolean };

export default function PanelLotesList({
  isOpen,
  onClose,
  onLoteSelect,
  onAuthError,
}: PanelLotesListProps) {
  const [status, setStatus] = useState<FetchStatus>({ phase: "idle" });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loadingDetailId, setLoadingDetailId] = useState<string | null>(null);

  const loadLotes = useCallback(async () => {
    setStatus({ phase: "loading" });
    try {
      const lotes = await fetchLotes();
      setStatus({ phase: "ready", lotes });
    } catch (error) {
      if (error instanceof ApiServiceError && error.status === 401) {
        setStatus({
          phase: "error",
          message: "Tu sesión expiró. Iniciá sesión nuevamente.",
          isAuth: true,
        });
        onAuthError?.();
        return;
      }

      const message =
        error instanceof ApiServiceError
          ? error.message
          : "No pudimos cargar tus lotes. Probá nuevamente en unos segundos.";
      setStatus({ phase: "error", message, isAuth: false });
    }
  }, [onAuthError]);

  useEffect(() => {
    if (!isOpen) return;
    if (status.phase === "idle") {
      void loadLotes();
    }
  }, [isOpen, loadLotes, status.phase]);

  const handleSelect = useCallback(
    async (lote: LoteListItem) => {
      if (loadingDetailId) return;
      setLoadingDetailId(lote.id);
      try {
        const full = await fetchLoteById(lote.id);
        setSelectedId(lote.id);
        onLoteSelect(full);
      } catch (error) {
        if (error instanceof ApiServiceError && error.status === 401) {
          onAuthError?.();
          return;
        }
        const message =
          error instanceof ApiServiceError
            ? error.message
            : "No se pudo abrir el lote seleccionado.";
        setStatus({ phase: "error", message, isAuth: false });
      } finally {
        setLoadingDetailId(null);
      }
    },
    [loadingDetailId, onAuthError, onLoteSelect],
  );

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.aside
          key="panel-lotes"
          role="complementary"
          aria-label="Mis lotes guardados"
          variants={panelVariants}
          initial="hidden"
          animate="visible"
          exit="exit"
          className="pointer-events-auto absolute left-4 top-4 z-20 flex h-[min(78dvh,640px)] flex-col overflow-hidden rounded-2xl border border-slate-800/70 bg-slate-950/85 shadow-2xl shadow-emerald-950/30 backdrop-blur-md"
          style={{ width: PANEL_WIDTH }}
        >
          <header className="flex items-center justify-between gap-3 border-b border-slate-800/80 bg-slate-900/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-300">
                <Layers size={18} strokeWidth={1.75} aria-hidden />
              </div>
              <div>
                <h2 className="text-sm font-semibold tracking-tight text-slate-100">
                  Mis lotes
                </h2>
                <p className="text-xs text-slate-400">
                  {status.phase === "ready"
                    ? `${status.lotes.length} guardado${status.lotes.length === 1 ? "" : "s"}`
                    : "Tus análisis recientes"}
                </p>
              </div>
            </div>
            <IconButton
              type="button"
              variant="soft"
              color="gray"
              size="2"
              radius="full"
              aria-label="Cerrar panel de lotes"
              onClick={onClose}
            >
              <X size={16} aria-hidden />
            </IconButton>
          </header>

          <ScrollArea
            type="hover"
            scrollbars="vertical"
            className="flex-1 px-3 py-3"
          >
            <PanelBody
              status={status}
              loadingDetailId={loadingDetailId}
              selectedId={selectedId}
              onSelect={handleSelect}
              onRetry={loadLotes}
              onAuthError={onAuthError}
            />
          </ScrollArea>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}

type PanelBodyProps = {
  status: FetchStatus;
  loadingDetailId: string | null;
  selectedId: string | null;
  onSelect: (lote: LoteListItem) => void | Promise<void>;
  onRetry: () => void | Promise<void>;
  onAuthError?: () => void;
};

function PanelBody({
  status,
  loadingDetailId,
  selectedId,
  onSelect,
  onRetry,
  onAuthError,
}: PanelBodyProps) {
  if (status.phase === "loading" || status.phase === "idle") {
    return <LoteListSkeleton />;
  }

  if (status.phase === "error") {
    return (
      <Callout.Root
        color="red"
        size="2"
        role="alert"
        className="border border-red-500/25 bg-red-950/40"
      >
        <Callout.Icon>
          <AlertCircle size={16} aria-hidden />
        </Callout.Icon>
        <Callout.Text>
          <span className="block text-sm text-red-100">{status.message}</span>
          <button
            type="button"
            onClick={() =>
              status.isAuth ? onAuthError?.() : void onRetry()
            }
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-xs font-medium text-red-100 transition-colors hover:bg-red-500/20 focus:outline-none focus:ring-2 focus:ring-red-500/40"
          >
            <RefreshCw size={12} aria-hidden />
            {status.isAuth ? "Ir al login" : "Reintentar"}
          </button>
        </Callout.Text>
      </Callout.Root>
    );
  }

  if (status.lotes.length === 0) {
    return <LoteListEmpty />;
  }

  return (
    <motion.ul
      variants={listVariants}
      initial="hidden"
      animate="visible"
      className="flex flex-col gap-2"
    >
      {status.lotes.map((lote) => (
        <LoteCard
          key={lote.id}
          lote={lote}
          isSelected={selectedId === lote.id}
          isLoading={loadingDetailId === lote.id}
          disabled={Boolean(loadingDetailId) && loadingDetailId !== lote.id}
          onSelect={onSelect}
        />
      ))}
    </motion.ul>
  );
}

type LoteCardProps = {
  lote: LoteListItem;
  isSelected: boolean;
  isLoading: boolean;
  disabled: boolean;
  onSelect: (lote: LoteListItem) => void | Promise<void>;
};

function LoteCard({
  lote,
  isSelected,
  isLoading,
  disabled,
  onSelect,
}: LoteCardProps) {
  return (
    <motion.li variants={itemVariants}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => void onSelect(lote)}
        aria-pressed={isSelected}
        aria-busy={isLoading}
        className={[
          "group relative w-full overflow-hidden rounded-xl border px-3.5 py-3 text-left transition-all duration-200",
          "focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950",
          "disabled:cursor-not-allowed disabled:opacity-50",
          isSelected
            ? "border-emerald-500/50 bg-emerald-500/10 shadow-[0_8px_24px_-12px_rgba(16,185,129,0.45)]"
            : "border-slate-800/80 bg-slate-900/60 hover:-translate-y-0.5 hover:border-emerald-500/30 hover:bg-slate-900/85 hover:shadow-[0_8px_24px_-16px_rgba(16,185,129,0.35)]",
        ].join(" ")}
      >
        <div
          aria-hidden
          className={[
            "absolute inset-y-0 left-0 w-0.5 transition-colors",
            isSelected ? "bg-emerald-400" : "bg-transparent group-hover:bg-emerald-500/50",
          ].join(" ")}
        />

        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-sm font-medium text-slate-100">
              {lote.nombre}
            </h3>
            <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
              <MapPin size={11} aria-hidden />
              <span>{formatFecha(lote.createdAt)}</span>
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <span
              className={[
                "rounded-md px-2 py-1 text-xs font-semibold tabular-nums transition-colors",
                isSelected
                  ? "bg-emerald-500/20 text-emerald-200"
                  : "bg-slate-800/80 text-slate-300 group-hover:bg-emerald-500/15 group-hover:text-emerald-200",
              ].join(" ")}
            >
              {formatHectareas(lote.areaHectareas)}
            </span>
            {isLoading && (
              <Loader2
                size={14}
                className="animate-spin text-emerald-300"
                aria-hidden
              />
            )}
          </div>
        </div>
      </button>
    </motion.li>
  );
}

function LoteListSkeleton() {
  return (
    <ul className="flex animate-pulse flex-col gap-2" aria-hidden>
      {Array.from({ length: 4 }).map((_, idx) => (
        <li
          key={idx}
          className="overflow-hidden rounded-xl border border-slate-800/70 bg-slate-900/40 px-3.5 py-3"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-2">
              <div className="h-3.5 w-2/3 rounded bg-slate-800/80" />
              <div className="h-2.5 w-1/3 rounded bg-slate-800/60" />
            </div>
            <div className="h-6 w-16 rounded-md bg-slate-800/80" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function LoteListEmpty() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-10 text-center">
      <div className="flex h-14 w-14 items-center justify-center rounded-2xl border border-slate-800/80 bg-slate-900/60 text-slate-500">
        <FileText size={22} strokeWidth={1.5} aria-hidden />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-slate-200">
          Todavía no tenés lotes guardados
        </p>
        <p className="px-4 text-xs leading-relaxed text-slate-500">
          Dibujá un polígono sobre el mapa y confirmá el análisis para empezar
          a construir tu historial.
        </p>
      </div>
    </div>
  );
}
