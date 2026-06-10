"use client";

import { useLoteDetalle } from "@/hooks/useLoteDetalle";
import { NDVI_DEFAULT_PERIOD, useNDVISerie, type NDVIPeriodId } from "@/hooks/useNDVISerie";
import { useSaludLote } from "@/hooks/useSaludLote";
import { clusterizarDetecciones } from "@/lib/incendiosClustering";
import {
  ApiServiceError,
  createReporte,
  deleteLote,
  fetchEstablecimientos,
  renameLote,
  setLoteEstablecimiento,
  uploadReportePdf,
  type EstablecimientoListItem,
} from "@/services";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  ScrollArea,
  Select,
  Skeleton,
  Tabs,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  CheckCircle2,
  Droplets,
  FileText,
  Flame,
  LandPlot,
  LineChart,
  Loader2,
  Mountain,
  Pencil,
  Sprout,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import { HistorialHidrico } from "./HistorialHidrico";
import { HistorialNDVI } from "./HistorialNDVI";
import { RegistroTermico } from "./RegistroTermico";
import { ScoreSaludCard } from "./ScoreSaludCard";
import type { LoteReporteData } from "./LoteReportePDF";

const LoteMiniMap = dynamic(() => import("./LoteMiniMap"), {
  ssr: false,
  loading: () => (
    <Skeleton style={{ width: "100%", height: 200, borderRadius: "var(--radius-3)" }} />
  ),
});

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

const CARD_FLEX: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  paddingBlock: "var(--space-3)",
};

const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

type LoteDetalleViewProps = {
  establecimientoId: string;
  loteId: string;
};

export default function LoteDetalleView({ loteId }: LoteDetalleViewProps) {
  const router = useRouter();
  const {
    phase,
    lote,
    analisis,
    incendios,
    error,
    isAuthError,
    isNotFound,
    reload,
    applyNombre,
  } = useLoteDetalle(loteId);

  // ── Editar nombre (inline) ────────────────────────────────────────────
  const [isEditingNombre, setIsEditingNombre] = useState(false);
  const [nombreDraft, setNombreDraft] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // ── Eliminar lote (confirmación destructiva) ──────────────────────────
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // ── Exportar reporte PDF + guardar en historial ───────────────────────
  const [exporting, setExporting] = useState(false);

  // ── Toast efímero (asignación de establecimiento, etc.) ────────────────
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback((kind: ToastState["kind"], message: string) => {
    // `id` fuerza el remount de la animación si llegan toasts consecutivos.
    setToast({ kind, message, id: Date.now() });
  }, []);

  const startEditNombre = () => {
    if (!lote) return;
    setNombreDraft(lote.nombre);
    setRenameError(null);
    setIsEditingNombre(true);
  };

  const cancelEditNombre = () => {
    setIsEditingNombre(false);
    setRenameError(null);
  };

  const handleSubmitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!lote) return;

    const nuevo = nombreDraft.trim();
    if (!nuevo) {
      setRenameError("El nombre no puede quedar vacío.");
      return;
    }
    if (nuevo === lote.nombre) {
      setIsEditingNombre(false);
      return;
    }

    setRenaming(true);
    setRenameError(null);
    try {
      await renameLote(lote.id, nuevo);
      applyNombre(nuevo);
      setIsEditingNombre(false);
    } catch (cause) {
      setRenameError(
        cause instanceof Error ? cause.message : "No se pudo renombrar el lote.",
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!lote) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await deleteLote(lote.id);
      setConfirmDeleteOpen(false);
      router.push("/dashboard");
    } catch (cause) {
      setDeleteError(
        cause instanceof Error ? cause.message : "No se pudo eliminar el lote.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // Score + serie NDVI: estado propio (única pieza que pega a Sentinel en vivo).
  const salud = useSaludLote(loteId);

  // Selector de período del gráfico NDVI (reusa la serie base para 30 días).
  const [ndviPeriod, setNdviPeriod] = useState<NDVIPeriodId>(NDVI_DEFAULT_PERIOD);
  const ndviSerie = useNDVISerie({
    loteId,
    period: ndviPeriod,
    baseSerie: salud.baseSerie,
    baseStatus: salud.phase,
  });

  // Historial completo de focos FIRMS, clusterizado por evento.
  const eventosIncendio = useMemo(
    () => (incendios ? clusterizarDetecciones(incendios) : []),
    [incendios],
  );

  // Redirección a login ante sesión expirada (401), reutilizable por las
  // mutaciones (asignar establecimiento) además de los fetch iniciales.
  const handleAuthExpired = useCallback(() => {
    const search = new URLSearchParams({
      tab: "login",
      error: "Tu sesión expiró. Iniciá sesión nuevamente.",
    });
    router.replace(`/?${search.toString()}`);
  }, [router]);

  // Sesión expirada en cualquiera de los fetch → login.
  useEffect(() => {
    const authExpired =
      (phase === "error" && isAuthError) ||
      (salud.phase === "error" && salud.isAuthError);
    if (authExpired) handleAuthExpired();
  }, [phase, isAuthError, salud.phase, salud.isAuthError, handleAuthExpired]);

  // Establecimientos del usuario (para resolver el nombre en la cabecera del
  // reporte PDF). Se cargan una vez; el nombre se deriva por memo.
  const [establecimientos, setEstablecimientos] = useState<
    EstablecimientoListItem[] | null
  >(null);
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    fetchEstablecimientos({ signal: controller.signal })
      .then((list) => {
        if (!cancelled) setEstablecimientos(list);
      })
      .catch(() => {
        if (!cancelled) setEstablecimientos([]);
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  const establecimientoNombre = useMemo<string | null>(() => {
    const estId = lote?.establecimientoId;
    if (!estId || !establecimientos) return null;
    return establecimientos.find((e) => e.id === estId)?.nombre ?? null;
  }, [lote?.establecimientoId, establecimientos]);

  // Snapshot satelital best-effort del mini-mapa para el reporte PDF.
  const [mapaLoteBase64, setMapaLoteBase64] = useState<string | null>(null);
  const handleMapSnapshot = useCallback((dataUrl: string | null) => {
    setMapaLoteBase64(dataUrl);
  }, []);

  const saludSettled = salud.phase === "ready" || salud.phase === "error";

  // Datos planos para la plantilla del reporte PDF. Se mantiene en `null`
  // (botón "Preparando documento…") hasta que el lote y la salud estén
  // resueltos. La curva NDVI se dibuja nativa en el PDF (no requiere captura).
  const reporteData = useMemo<LoteReporteData | null>(() => {
    if (!lote || !saludSettled) return null;

    const estado =
      salud.healthScore?.categoria === "Alta"
        ? "Salud Alta"
        : salud.healthScore?.categoria === "Moderada"
          ? "Salud Moderada"
          : salud.healthScore?.categoria === "Baja"
            ? "Salud Baja"
            : "Sin datos";

    const confianzaLabel = (c: "l" | "n" | "h" | null): string =>
      c === "h" ? "Alta" : c === "n" ? "Nominal" : c === "l" ? "Baja" : "—";

    const ring = lote.poligonoGeoJSON?.geometry?.coordinates?.[0] ?? [];
    const geometriaPoligono = ring.map(
      ([lng, lat]) => [lng, lat] as [number, number],
    );

    return {
      loteNombre: lote.nombre,
      establecimientoNombre,
      generadoEn: new Date(),
      superficieHa: lote.areaHectareas ?? null,
      elevacionMedia: analisis?.elevacion ?? null,
      score: salud.healthScore?.score ?? null,
      estadoSalud: estado,
      ndviPromedio: salud.healthScore?.ndviPromedio ?? null,
      geometriaPoligono,
      serieNdvi: ndviSerie.serie.map((p) => ({ fecha: p.fecha, ndvi: p.ndvi })),
      rasterNdviUrl: salud.ndviImgUrl,
      mapaLoteBase64,
      inundaciones: (analisis?.inundaciones ?? []).map((f) => ({
        began: f.began,
        ended: f.ended,
        duracionDias: f.duracionDias,
      })),
      focos: eventosIncendio.map((ev) => ({
        fecha: ev.fecha,
        confianza: confianzaLabel(ev.confianzaMax),
        frpMax: ev.frpMax,
        satelites: ev.satelites.join(", "),
      })),
    };
  }, [
    lote,
    saludSettled,
    establecimientoNombre,
    analisis,
    salud.healthScore,
    salud.ndviImgUrl,
    ndviSerie.serie,
    mapaLoteBase64,
    eventosIncendio,
  ]);

  /**
   * Exporta el reporte PDF y, en la misma pasada, lo guarda en el historial:
   *  1. Genera el `Blob` del PDF (import dinámico → mantiene code-split).
   *  2. Dispara la descarga local inmediata (UX de siempre).
   *  3. Sube el binario al bucket privado de Supabase Storage.
   *  4. Persiste la metadata vía `POST /api/reportes`.
   *
   * La descarga local nunca se bloquea por el guardado: si falla la subida o el
   * POST, el usuario igual se queda con su PDF y ve un toast de error.
   */
  const handleExportReporte = useCallback(async () => {
    if (!reporteData || !lote) return;

    setExporting(true);
    let downloaded = false;
    try {
      const { generateReporteBlob, slugify } = await import("./LoteReportePDF");
      const blob = await generateReporteBlob(reporteData);

      const slug = slugify(lote.nombre);
      const fechaArchivo = reporteData.generadoEn.toISOString().slice(0, 10);
      const fileName = `reporte-${slug}-${fechaArchivo}.pdf`;

      // Descarga local inmediata.
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = fileName;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      downloaded = true;

      // Guardado en historial (Storage + metadata).
      const urlStorage = await uploadReportePdf({
        blob,
        loteId: lote.id,
        slug,
      });
      await createReporte({
        nombre: `Reporte Técnico · ${lote.nombre}`,
        establecimiento: establecimientoNombre,
        urlStorage,
        loteId: lote.id,
      });

      showToast("success", "Reporte guardado en tu historial.");
    } catch (cause) {
      if (cause instanceof ApiServiceError && cause.status === 401) {
        handleAuthExpired();
        return;
      }
      showToast(
        "error",
        downloaded
          ? "El PDF se descargó, pero no pudimos guardarlo en tu historial."
          : cause instanceof Error
            ? cause.message
            : "No se pudo exportar el reporte.",
      );
    } finally {
      setExporting(false);
    }
  }, [
    reporteData,
    lote,
    establecimientoNombre,
    showToast,
    handleAuthExpired,
  ]);

  return (
    <Flex
      direction="column"
      className="agro-panel h-full w-full overflow-hidden"
      px={{ initial: "4", md: "6" }}
      py={{ initial: "4", md: "6" }}
    >
      <Box
        className="h-full min-h-0 w-full"
        style={{
          maxWidth: 1400,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Cabecera ──────────────────────────────────────────────────── */}
        <Box className="shrink-0">
          {/* Fila 1: navegación "Volver" sobre el nombre del lote. */}
          <Button
            type="button"
            variant="ghost"
            color="gray"
            size="2"
            onClick={() => router.push("/dashboard")}
            style={{ marginInlineStart: 0 }}
          >
            <ArrowLeft size={16} aria-hidden />
            Volver
          </Button>

          {/* Fila 2: nombre (editable) + acciones. */}
          <Flex align="center" justify="between" gap="4" wrap="wrap" mt="2">
            {phase === "loading" ? (
              <Skeleton style={{ height: 36, width: 260 }} />
            ) : isEditingNombre && lote ? (
              <form onSubmit={handleSubmitRename} style={{ flexGrow: 1, minWidth: 0 }}>
                <Flex direction="column" gap="1" style={{ maxWidth: 520 }}>
                  <Flex align="center" gap="2">
                    <TextField.Root
                      value={nombreDraft}
                      onChange={(e) => setNombreDraft(e.target.value)}
                      disabled={renaming}
                      autoFocus
                      size="3"
                      style={{ flexGrow: 1 }}
                      aria-label="Nombre del lote"
                    />
                    <Tooltip content="Guardar nombre">
                      <IconButton
                        type="submit"
                        variant="solid"
                        color="jade"
                        size="3"
                        radius="medium"
                        disabled={renaming || nombreDraft.trim().length === 0}
                        aria-label="Guardar nombre"
                      >
                        {renaming ? (
                          <Loader2 size={16} className="animate-spin" aria-hidden />
                        ) : (
                          <Check size={16} aria-hidden />
                        )}
                      </IconButton>
                    </Tooltip>
                    <Tooltip content="Cancelar">
                      <IconButton
                        type="button"
                        variant="soft"
                        color="gray"
                        size="3"
                        radius="medium"
                        disabled={renaming}
                        onClick={cancelEditNombre}
                        aria-label="Cancelar edición del nombre"
                      >
                        <X size={16} aria-hidden />
                      </IconButton>
                    </Tooltip>
                  </Flex>
                  {renameError && (
                    <Text size="1" color="red">
                      {renameError}
                    </Text>
                  )}
                </Flex>
              </form>
            ) : (
              <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                <Heading
                  size="7"
                  weight="bold"
                  truncate
                  style={{ letterSpacing: "-0.02em", maxWidth: "min(100%, 480px)" }}
                >
                  {lote?.nombre ?? "Lote"}
                </Heading>
                {lote && (
                  <Tooltip content="Editar nombre">
                    <IconButton
                      type="button"
                      variant="ghost"
                      color="gray"
                      size="2"
                      aria-label="Editar nombre del lote"
                      onClick={startEditNombre}
                      style={{ flexShrink: 0 }}
                    >
                      <Pencil size={16} aria-hidden />
                    </IconButton>
                  </Tooltip>
                )}
              </Flex>
            )}

            {!isEditingNombre && (
              <Flex align="center" gap="2" flexShrink="0">
                {lote && (
                  <Tooltip content="Eliminar lote">
                    <IconButton
                      type="button"
                      variant="soft"
                      color="red"
                      size="2"
                      radius="medium"
                      aria-label="Eliminar lote"
                      onClick={() => {
                        setDeleteError(null);
                        setConfirmDeleteOpen(true);
                      }}
                      disabled={deleting}
                    >
                      <Trash2 size={16} aria-hidden />
                    </IconButton>
                  </Tooltip>
                )}
                <Button
                  type="button"
                  variant="soft"
                  color="jade"
                  size="2"
                  disabled={!reporteData || exporting}
                  onClick={() => void handleExportReporte()}
                >
                  {exporting ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Guardando reporte en historial…
                    </>
                  ) : !reporteData && lote ? (
                    <>
                      <Loader2 size={16} className="animate-spin" aria-hidden />
                      Preparando documento…
                    </>
                  ) : (
                    <>
                      <FileText size={16} aria-hidden />
                      Exportar Reporte PDF
                    </>
                  )}
                </Button>
              </Flex>
            )}
          </Flex>
        </Box>

        {/* Diálogo destructivo: eliminar lote */}
        <AlertDialog.Root
          open={confirmDeleteOpen}
          onOpenChange={(open) => {
            if (deleting) return;
            setConfirmDeleteOpen(open);
            if (!open) setDeleteError(null);
          }}
        >
          <AlertDialog.Content maxWidth="440px">
            <AlertDialog.Title>¿Eliminar lote?</AlertDialog.Title>
            <AlertDialog.Description size="2">
              Esta acción eliminará el lote{" "}
              <Text as="span" weight="bold">
                {lote?.nombre ?? ""}
              </Text>{" "}
              y todos sus análisis de GEE de forma permanente. No se puede
              deshacer.
            </AlertDialog.Description>

            {deleteError && (
              <Callout.Root color="red" size="1" variant="soft" mt="3">
                <Callout.Icon>
                  <AlertTriangle size={16} aria-hidden />
                </Callout.Icon>
                <Callout.Text>{deleteError}</Callout.Text>
              </Callout.Root>
            )}

            <Flex gap="3" mt="4" justify="end">
              <AlertDialog.Cancel>
                <Button variant="soft" color="gray" disabled={deleting}>
                  Cancelar
                </Button>
              </AlertDialog.Cancel>
              <Button
                variant="solid"
                color="red"
                onClick={() => void handleConfirmDelete()}
                disabled={deleting}
              >
                {deleting ? (
                  <>
                    <Loader2 size={16} className="animate-spin" aria-hidden />
                    Eliminando…
                  </>
                ) : (
                  "Eliminar definitivamente"
                )}
              </Button>
            </Flex>
          </AlertDialog.Content>
        </AlertDialog.Root>

        {phase === "error" && !isAuthError && (
          <Callout.Root color="red" variant="surface" mt="4" className="shrink-0">
            <Callout.Icon>
              <AlertTriangle size={16} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              <Flex align="center" justify="between" gap="3" wrap="wrap">
                <Text as="span">
                  {isNotFound
                    ? "No encontramos este lote o no tenés permiso para verlo."
                    : error}
                </Text>
                {!isNotFound && (
                  <Button size="1" variant="soft" color="red" onClick={reload} type="button">
                    Reintentar
                  </Button>
                )}
              </Flex>
            </Callout.Text>
          </Callout.Root>
        )}

        {/* ── Contenido principal (alto fijo) ─────────────────────────────── */}
        <Box className="mt-4 min-h-0 flex-1 overflow-hidden">
          <Grid
            columns={{ initial: "1", md: "12" }}
            rows={{ initial: "2", md: "1" }}
            gap="5"
            className="h-full"
          >
            {/* Izquierda: mapa + KPIs topográficos + Score de salud */}
            <Box
              gridColumn={{ initial: "auto", md: "span 6" }}
              className="h-full min-h-0 min-w-0"
            >
              {phase === "loading" ? (
                <LoteDetalleLeftSkeleton />
              ) : (
                lote && (
                  <ScrollArea scrollbars="vertical" type="hover" style={{ height: "100%" }}>
                    <Flex direction="column" gap="3" pr="3">
                      <Card size="2" variant="surface" className="agro-surface" style={CARD_FLEX}>
                        <Flex direction="column" gap="3">
                          <LoteMiniMap
                            polygon={lote.poligonoGeoJSON}
                            height={200}
                            onSnapshot={handleMapSnapshot}
                          />
                          <Grid columns="2" gap="3">
                            <KpiTopografico
                              icon={LandPlot}
                              label="Superficie"
                              value={`${HECTAREAS_FMT.format(lote.areaHectareas)} ha`}
                              tone="grass"
                            />
                            <KpiTopografico
                              icon={Mountain}
                              label="Elevación media"
                              value={
                                analisis?.elevacion !== null &&
                                analisis?.elevacion !== undefined
                                  ? `${HECTAREAS_FMT.format(analisis.elevacion)} m s.n.m.`
                                  : "—"
                              }
                              tone="sky"
                            />
                          </Grid>
                          <Text
                            size="1"
                            className="text-slate-400"
                            style={{ fontSize: SECONDARY_FONT }}
                          >
                            Creado el{" "}
                            {new Date(lote.createdAt).toLocaleDateString("es-AR", {
                              day: "2-digit",
                              month: "long",
                              year: "numeric",
                            })}
                          </Text>
                        </Flex>
                      </Card>

                      <ScoreSaludCard
                        phase={salud.phase}
                        healthScore={salud.healthScore}
                        error={salud.error}
                      />
                    </Flex>
                  </ScrollArea>
                )
              )}
            </Box>

            {/* Derecha: pestañas NDVI / Hídrico / Térmico + asignación de campo */}
            <Box
              gridColumn={{ initial: "auto", md: "span 6" }}
              className="h-full min-h-0 min-w-0"
            >
              {phase === "loading" ? (
                <LoteDetalleRightSkeleton />
              ) : (
                analisis &&
                lote && (
                  <Flex direction="column" gap="4" className="h-full min-h-0">
                    <Box className="min-h-0 flex-1">
                  <Card size="3" variant="surface" className="agro-surface h-full" style={CARD_FLEX}>
                    <Tabs.Root defaultValue="ndvi" className="flex min-h-0 flex-1 flex-col">
                      <Tabs.List className="shrink-0">
                        <Tabs.Trigger value="ndvi">
                          <Flex align="center" gap="2">
                            <LineChart size={14} aria-hidden />
                            Historial NDVI
                          </Flex>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="hidrico">
                          <Flex align="center" gap="2">
                            <Droplets size={14} aria-hidden />
                            Hídrico
                            {analisis.eventosInundacion > 0 && (
                              <Text as="span" size="1" style={{ color: "var(--sky-11)", fontWeight: 600 }}>
                                ({analisis.eventosInundacion})
                              </Text>
                            )}
                          </Flex>
                        </Tabs.Trigger>
                        <Tabs.Trigger value="termico">
                          <Flex align="center" gap="2">
                            <Flame size={14} aria-hidden />
                            Térmico
                            {eventosIncendio.length > 0 && (
                              <Text as="span" size="1" style={{ color: "var(--orange-11)", fontWeight: 600 }}>
                                ({eventosIncendio.length})
                              </Text>
                            )}
                          </Flex>
                        </Tabs.Trigger>
                      </Tabs.List>

                      <Box className="mt-3 min-h-0 flex-1">
                        <Tabs.Content value="ndvi" className="h-full">
                          <ScrollArea scrollbars="vertical" type="hover" style={{ height: "100%" }}>
                            <Box pr="3" pb="2">
                              <HistorialNDVI
                                serie={ndviSerie.serie}
                                status={ndviSerie.status}
                                period={ndviPeriod}
                                onPeriodChange={setNdviPeriod}
                              />
                            </Box>
                          </ScrollArea>
                        </Tabs.Content>

                        <Tabs.Content value="hidrico" className="h-full">
                          <ScrollArea scrollbars="vertical" type="hover" style={{ height: "100%" }}>
                            <Box pr="3" pb="2">
                              <HistorialHidrico eventos={analisis.inundaciones} />
                            </Box>
                          </ScrollArea>
                        </Tabs.Content>

                        <Tabs.Content value="termico" className="h-full">
                          <ScrollArea scrollbars="vertical" type="hover" style={{ height: "100%" }}>
                            <Box pr="3" pb="2">
                              <RegistroTermico eventos={eventosIncendio} />
                            </Box>
                          </ScrollArea>
                        </Tabs.Content>
                      </Box>
                    </Tabs.Root>
                  </Card>
                    </Box>

                    <AsignarEstablecimientoCard
                      loteId={lote.id}
                      establecimientoId={lote.establecimientoId ?? null}
                      onAuthError={handleAuthExpired}
                      onResult={showToast}
                    />
                  </Flex>
                )
              )}
            </Box>
          </Grid>
        </Box>
      </Box>

      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

const SIN_CAMPO = "__none__";

type AsignarEstablecimientoCardProps = {
  loteId: string;
  establecimientoId: string | null;
  onAuthError: () => void;
  onResult: (kind: ToastState["kind"], message: string) => void;
};

/**
 * Card para asignar / reasignar el lote a un establecimiento del usuario.
 * Auto-guarda al cambiar la selección (incluye la opción "Sin establecimiento")
 * y notifica el resultado vía toast (`onResult`).
 */
function AsignarEstablecimientoCard({
  loteId,
  establecimientoId,
  onAuthError,
  onResult,
}: AsignarEstablecimientoCardProps) {
  const [opciones, setOpciones] = useState<EstablecimientoListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actual, setActual] = useState<string | null>(establecimientoId);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetchEstablecimientos({ signal: controller.signal })
      .then((data) => {
        if (cancelled) return;
        setOpciones(data);
        setLoading(false);
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        if (cause instanceof ApiServiceError && cause.status === 401) {
          onAuthError();
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar los establecimientos.",
        );
        setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [onAuthError]);

  const nombrePorId = (id: string | null) =>
    id ? (opciones.find((e) => e.id === id)?.nombre ?? "el establecimiento") : null;

  const handleChange = async (value: string) => {
    const nextId = value === SIN_CAMPO ? null : value;
    if (nextId === actual) return;

    const previo = actual;
    setActual(nextId);
    setSaving(true);
    setError(null);
    try {
      await setLoteEstablecimiento(loteId, nextId);
      if (nextId === null) {
        onResult("success", "Lote quitado del establecimiento.");
      } else {
        onResult("success", `Lote asignado a “${nombrePorId(nextId)}”.`);
      }
    } catch (cause) {
      setActual(previo); // rollback visual
      if (cause instanceof ApiServiceError && cause.status === 401) {
        onAuthError();
        return;
      }
      const message =
        cause instanceof Error
          ? cause.message
          : "No se pudo actualizar el establecimiento.";
      setError(message);
      onResult("error", message);
    } finally {
      setSaving(false);
    }
  };

  const nombreActual = nombrePorId(actual);
  const sinCampos = !loading && opciones.length === 0;

  return (
    <Card size="2" variant="surface" className="agro-surface shrink-0">
      <Flex direction="column" gap="3">
        {/* Encabezado + estado actual */}
        <Flex align="start" justify="between" gap="3">
          <Flex align="center" gap="2" style={{ minWidth: 0 }}>
            <Flex
              align="center"
              justify="center"
              flexShrink="0"
              style={{
                width: 32,
                height: 32,
                borderRadius: "var(--radius-3)",
                backgroundColor: "var(--jade-a3)",
                color: "var(--jade-11)",
              }}
            >
              <Sprout size={17} aria-hidden />
            </Flex>
            <Box style={{ minWidth: 0 }}>
              <Text size="2" weight="bold" highContrast>
                Establecimiento
              </Text>
              <Text
                as="div"
                size="1"
                className="text-slate-400"
                style={{ fontSize: SECONDARY_FONT }}
              >
                Agrupá este lote dentro de un campo
              </Text>
            </Box>
          </Flex>

          {!loading &&
            (nombreActual ? (
              <Badge color="jade" variant="soft" radius="full" style={{ flexShrink: 0 }}>
                <Check size={12} aria-hidden />
                Asignado
              </Badge>
            ) : (
              <Badge color="gray" variant="soft" radius="full" style={{ flexShrink: 0 }}>
                Sin asignar
              </Badge>
            ))}
        </Flex>

        {/* Estado legible de la pertenencia actual */}
        {!loading && (
          <Text size="2" className="text-slate-300">
            {nombreActual ? (
              <>
                Pertenece a{" "}
                <Text as="span" weight="medium" highContrast>
                  {nombreActual}
                </Text>
                .
              </>
            ) : null}
          </Text>
        )}

        {error && (
          <Callout.Root color="red" size="1" variant="soft">
            <Callout.Icon>
              <AlertTriangle size={14} aria-hidden />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {sinCampos ? (
          <Callout.Root color="gray" size="1" variant="soft">
            <Callout.Icon>
              <Sprout size={14} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              Todavía no tenés establecimientos. Creá uno desde la sección
              Establecimientos para poder asignar este lote.
            </Callout.Text>
          </Callout.Root>
        ) : (
          <Box>
            <Text
              as="label"
              size="1"
              color="gray"
              weight="medium"
              style={{
                display: "block",
                marginBottom: 6,
                textTransform: "uppercase",
                letterSpacing: "0.05em",
                fontSize: SECONDARY_FONT,
              }}
            >
              {nombreActual ? "Mover a otro campo" : "Asignar a un campo"}
            </Text>
            <Flex align="center" gap="3" wrap="wrap">
              <Box style={{ flex: "1 1 220px", minWidth: 0 }}>
                <Select.Root
                  value={actual ?? SIN_CAMPO}
                  onValueChange={(v) => void handleChange(v)}
                  disabled={loading || saving}
                  size="2"
                >
                  <Select.Trigger
                    placeholder={loading ? "Cargando…" : "Seleccionar campo"}
                    style={{ width: "100%" }}
                  />
                  <Select.Content position="popper">
                    <Select.Item value={SIN_CAMPO}>
                      Sin establecimiento
                    </Select.Item>
                    {opciones.length > 0 && <Select.Separator />}
                    {opciones.map((est) => (
                      <Select.Item key={est.id} value={est.id}>
                        {est.nombre}
                      </Select.Item>
                    ))}
                  </Select.Content>
                </Select.Root>
              </Box>

              {saving && (
                <Flex align="center" gap="1" style={{ color: "var(--gray-11)" }}>
                  <Loader2 size={14} className="animate-spin" aria-hidden />
                  <Text size="1">Guardando…</Text>
                </Flex>
              )}
            </Flex>
          </Box>
        )}
      </Flex>
    </Card>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

type ToastState = {
  kind: "success" | "error";
  message: string;
  /** Marca temporal: re-dispara la animación ante toasts consecutivos. */
  id: number;
};

/**
 * Toast efímero (abajo a la derecha) con framer-motion. Se auto-descarta a
 * los 3.5 s y puede cerrarse manualmente.
 */
function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 3500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const isSuccess = toast?.kind === "success";

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            maxWidth: 380,
          }}
          role="status"
          aria-live="polite"
        >
          <Card
            size="2"
            className="agro-glass"
            style={{
              borderLeft: `3px solid ${
                isSuccess ? "var(--jade-9)" : "var(--red-9)"
              }`,
            }}
          >
            <Flex align="center" gap="3">
              {isSuccess ? (
                <CheckCircle2 size={18} aria-hidden style={{ color: "var(--jade-11)", flexShrink: 0 }} />
              ) : (
                <XCircle size={18} aria-hidden style={{ color: "var(--red-11)", flexShrink: 0 }} />
              )}
              <Text size="2" weight="medium" style={{ minWidth: 0 }}>
                {toast.message}
              </Text>
              <IconButton
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                aria-label="Cerrar notificación"
                onClick={onDismiss}
                style={{ flexShrink: 0, marginLeft: "auto" }}
              >
                <X size={14} aria-hidden />
              </IconButton>
            </Flex>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function KpiTopografico({
  icon: Icon,
  label,
  value,
  tone,
}: {
  icon: typeof LandPlot;
  label: string;
  value: string;
  tone: "grass" | "sky";
}) {
  return (
    <Card size="1" variant="surface">
      <Flex direction="column" gap="1">
        <Flex align="center" justify="between">
          <Text
            size="1"
            color="gray"
            weight="medium"
            style={{
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontSize: SECONDARY_FONT,
            }}
          >
            {label}
          </Text>
          <Icon size={14} aria-hidden style={{ color: `var(--${tone}-a10)` }} />
        </Flex>
        <Text size="4" weight="bold" style={{ lineHeight: 1, color: `var(--${tone}-11)` }}>
          {value}
        </Text>
      </Flex>
    </Card>
  );
}

function LoteDetalleLeftSkeleton() {
  return (
    <Card size="2" variant="surface" className="agro-surface h-full" style={CARD_FLEX}>
      <Flex direction="column" gap="3">
        <Skeleton style={{ width: "100%", height: 200, borderRadius: "var(--radius-3)" }} />
        <Grid columns="2" gap="3">
          <Skeleton style={{ height: 60, borderRadius: "var(--radius-3)" }} />
          <Skeleton style={{ height: 60, borderRadius: "var(--radius-3)" }} />
        </Grid>
        <Skeleton style={{ height: 120, borderRadius: "var(--radius-3)" }} />
      </Flex>
    </Card>
  );
}

function LoteDetalleRightSkeleton() {
  return (
    <Card size="3" variant="surface" className="agro-surface h-full" style={CARD_FLEX}>
      <Flex direction="column" gap="3">
        <Flex gap="3">
          <Skeleton style={{ height: 32, width: 130 }} />
          <Skeleton style={{ height: 32, width: 100 }} />
          <Skeleton style={{ height: 32, width: 100 }} />
        </Flex>
        <Skeleton style={{ height: 172, borderRadius: "var(--radius-3)" }} />
        {Array.from({ length: 2 }).map((_, i) => (
          <Skeleton key={i} style={{ height: 56, borderRadius: "var(--radius-3)" }} />
        ))}
      </Flex>
    </Card>
  );
}
