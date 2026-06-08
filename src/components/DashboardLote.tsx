"use client";

import NDVITimeSeriesChart from "@/components/NDVITimeSeriesChart";
import {
  NDVI_PERIODS,
  type NDVIPeriodId,
} from "@/hooks/useNDVISerie";
import {
  confianzaLabel,
  type IncendioEvento,
} from "@/lib/incendiosClustering";
import type {
  FloodEvent,
  HealthScoreSummary,
  NDVIStatPoint,
} from "@/services";
import type { AlertaHistorica, LoteAnalysisResult } from "@/types/loteAnalysis";
import {
  AlertDialog,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  IconButton,
  Progress,
  SegmentedControl,
  Separator,
  Skeleton,
  Text,
  TextField,
  Tooltip,
} from "@radix-ui/themes";
import {
  AlertTriangle,
  Check,
  EyeOff,
  Flame,
  Layers,
  Loader2,
  Mountain,
  Pencil,
  RefreshCw,
  Trash2,
  Waves,
  X,
} from "lucide-react";
import { useState, type FormEvent } from "react";

/**
 * Fase de una sección alimentada por un endpoint real. Espeja el `phase` de
 * los hooks (`useNDVILayer` / `useIncendios` / `useAnalisisEspacial`) para que
 * el panel decida entre skeleton, error o contenido sin conocer el hook.
 */
export type SectionStatus = "idle" | "loading" | "ready" | "error";

/** Estado del fetch de datos NDVI (gráfico + score). */
export type NDVIDataPhase = SectionStatus;

type DashboardLoteProps = {
  /** Identidad real del lote (id, nombre, hectáreas, fecha de proceso). */
  data: LoteAnalysisResult;
  onClear: () => void;

  /**
   * Estado del fetch de datos NDVI (serie + score). Mientras está en
   * `loading`/`idle` el panel muestra skeletons; en `error`, un callout; en
   * `ready`, el gráfico real y el bloque de score.
   */
  ndviDataStatus: NDVIDataPhase;
  /** Resumen de salud real (score, categoría, NDVI medio, fecha). */
  realHealthScore: HealthScoreSummary | null;

  /**
   * Serie temporal NDVI **del gráfico** (Sentinel-2 L2A, `P10D`). Su rango lo
   * controla el selector de período y es independiente del score/capa: cambiar
   * el período del gráfico nunca mueve el número de salud "actual".
   */
  ndviSerie: NDVIStatPoint[];
  /** Estado del fetch de la serie del gráfico (puede diferir del score). */
  ndviSerieStatus: SectionStatus;
  /** Período seleccionado para el gráfico (default: 30 días). */
  ndviPeriod: NDVIPeriodId;
  /** Handler para cambiar el período del gráfico. */
  onNdviPeriodChange: (period: NDVIPeriodId) => void;

  /**
   * Toggle de la **capa raster** sobre el mapa. Controla únicamente la
   * visualización: nunca borra los datos numéricos. Si es `undefined`, el
   * botón se oculta (e.g. cuando no hay mapa al lado).
   */
  onToggleLayer?: () => void;
  /** `true` cuando la capa raster está dibujada en el mapa. */
  layerVisible?: boolean;

  /** Estado del fetch de incendios (NASA FIRMS). */
  incendiosStatus: SectionStatus;
  /** Eventos de incendio deduplicados; sólo válido cuando status === "ready". */
  incendiosReales: IncendioEvento[] | null;

  /** Estado del fetch de inundaciones (Global Flood Database, vía GEE). */
  inundacionesStatus: SectionStatus;
  /** Eventos de inundación; sólo válido cuando status === "ready". */
  inundacionesReales: FloodEvent[] | null;

  /**
   * Elevación media del lote (m s.n.m.) del análisis espacial GEE, o `null`
   * si no hubo cobertura. Comparte estado con `inundacionesStatus` (ambos
   * salen del mismo endpoint `GET /api/gee/analisis/:loteId`).
   */
  elevacion: number | null;
  /** `true` si el análisis GEE salió de la caché del backend. */
  analisisCacheado?: boolean | null;
  /** ISO timestamp del último cálculo GEE persistido. */
  analisisActualizadoEn?: string | null;
  /** `true` mientras se recalcula el análisis (refresh manual con datos previos). */
  analisisRefreshing?: boolean;
  /**
   * Acción de "Actualizar datos": fuerza un recálculo contra GEE ignorando la
   * caché del backend. Si es `undefined`, el botón no se muestra.
   */
  onRefreshAnalysis?: () => void;

  /**
   * `true` si el lote ya está persistido en la base (tiene `id`). Gatea la
   * visibilidad de "Editar nombre" y "Eliminar": no tiene sentido ofrecerlas
   * sobre un polígono recién dibujado y aún no guardado.
   */
  loteGuardado?: boolean;
  /**
   * Renombra el lote. Debe resolver tras el PATCH al backend (o rechazar con
   * un Error legible). Si es `undefined`, el botón de editar no se muestra.
   */
  onRenameLote?: (loteId: string, nuevoNombre: string) => Promise<void>;
  /**
   * Elimina el lote (DELETE al backend). Debe resolver tras el éxito; el panel
   * llama a `onClear()` luego de eso. Si es `undefined`, no se muestra borrar.
   */
  onDeleteLote?: (loteId: string) => Promise<void>;
};

type ScoreTheme = {
  color: "jade" | "amber" | "red" | "gray";
  label: string;
};

/**
 * Mapea score numérico a color/label visual del bloque "Score de salud".
 *
 * Los cortes (`>=70` Alta, `>=40` Moderada, `<40` Baja) están sincronizados
 * con `healthCategoria` del backend (`LoteService`): si cambia uno, hay
 * que cambiar el otro para que la categoría textual y el color hablen el
 * mismo idioma.
 */
function getScoreTheme(score: number): ScoreTheme {
  if (score >= 70) return { color: "jade", label: "Salud alta" };
  if (score >= 40) return { color: "amber", label: "Salud media" };
  return { color: "red", label: "Salud baja" };
}

/** Tema neutral cuando el backend devuelve `"Sin datos"` en la categoría. */
const SIN_DATOS_THEME: ScoreTheme = { color: "gray", label: "Sin datos" };

/**
 * Formatea fecha `YYYY-MM-DD` a `d MMM YYYY` en español. UTC explícito
 * (igual que en `NDVITimeSeriesChart`) para evitar el shift de huso local
 * cuando la fecha viene del backend a las 00:00 UTC.
 */
function formatFechaCorta(fecha: string): string {
  const [year, month, day] = fecha.split("-").map(Number);
  if (!year || !month || !day) return fecha;
  return new Date(Date.UTC(year, month - 1, day)).toLocaleDateString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

function formatFechaHora(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-AR", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Regla de negocio: el análisis GEE (datasets estáticos SRTM/GFD) cambia
 * poquísimo, así que limitamos el recálculo manual a una vez cada 30 días
 * para no quemar cuota de Earth Engine sin valor para el productor.
 */
const ANALISIS_COOLDOWN_DIAS = 30;
const MS_POR_DIA = 86_400_000;

/** Días enteros transcurridos desde `iso` hasta ahora. `null` si es inválida. */
function diasDesde(iso: string): number | null {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.floor((Date.now() - t) / MS_POR_DIA);
}

/** Fecha (sin hora) en la que vuelve a habilitarse el recálculo manual. */
function proximoRecalculo(iso: string): Date {
  return new Date(new Date(iso).getTime() + ANALISIS_COOLDOWN_DIAS * MS_POR_DIA);
}

/** Fecha legible para el productor: "7 de junio de 2026". */
function formatFechaLarga(date: Date): string {
  return date.toLocaleDateString("es-AR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function yearFromFecha(fecha: string): number {
  return new Date(fecha).getFullYear();
}

/** Años únicos (ascendentes) presentes en un set de alertas, ignorando fechas inválidas. */
/**
 * Convierte un evento FIRMS deduplicado a una `AlertaHistorica` que
 * `<AlertaItem />` pueda renderizar. La descripción acumula contexto
 * agronómico (satélites, FRP máximo, confianza, nº de detecciones).
 */
function eventoToAlerta(evento: IncendioEvento): AlertaHistorica {
  // Impacto destacado: intensidad radiativa del foco (proxy de severidad).
  const impacto =
    evento.frpMax != null ? `FRP máx ${evento.frpMax.toFixed(1)} MW` : undefined;

  // Detalle sutil: satélites, confianza y nº de detecciones crudas.
  const detalleParts: string[] = [];
  detalleParts.push(
    evento.satelites.length > 1
      ? evento.satelites.join(" + ")
      : evento.satelites[0],
  );

  const confianza = confianzaLabel(evento.confianzaMax);
  if (confianza) {
    detalleParts.push(`confianza ${confianza}`);
  }

  if (evento.detecciones.length > 1) {
    detalleParts.push(`${evento.detecciones.length} detecciones`);
  }

  const detalle = detalleParts.join(" · ");

  return {
    tipo: "incendio",
    fecha: evento.fecha,
    impacto,
    detalle: detalle || undefined,
    descripcion: [impacto, detalle].filter(Boolean).join(" · "),
    fuente: "NASA FIRMS",
  };
}

/**
 * Convierte un evento del Global Flood Database (GFD) a una
 * `AlertaHistorica` de tipo inundación. La descripción resume duración y
 * rango de fechas; el `dfoId` (Dartmouth Flood Observatory) da trazabilidad
 * al evento original. La fuente se marca explícitamente como GFD/MODIS.
 */
function floodEventToAlerta(evento: FloodEvent): AlertaHistorica {
  // Impacto destacado: duración de la lámina de agua sobre el lote.
  const impacto =
    evento.duracionDias != null
      ? `${evento.duracionDias} ${evento.duracionDias === 1 ? "día" : "días"} de agua`
      : undefined;

  // Detalle sutil: rango de fechas y trazabilidad al evento original (DFO).
  const detalleParts: string[] = [];
  if (evento.began && evento.ended) {
    detalleParts.push(
      `${formatFechaCorta(evento.began)} → ${formatFechaCorta(evento.ended)}`,
    );
  }
  if (evento.dfoId != null) {
    detalleParts.push(`DFO #${evento.dfoId}`);
  }
  const detalle = detalleParts.join(" · ");

  return {
    tipo: "inundacion",
    fecha: evento.began ?? evento.ended ?? "",
    impacto,
    detalle: detalle || undefined,
    descripcion:
      [impacto, detalle].filter(Boolean).join(" · ") ||
      "Evento de inundación detectado.",
    fuente: "Global Flood Database",
  };
}

function formatHectareas(ha: number): string {
  return ha.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function AlertaItem({ alerta }: { alerta: AlertaHistorica }) {
  const isFire = alerta.tipo === "incendio";
  const year = yearFromFecha(alerta.fecha);
  const impacto = alerta.impacto;
  const detalle = alerta.detalle ?? alerta.descripcion;

  return (
    <Card size="1" variant="surface" style={{ padding: 0 }}>
      <Flex gap="3" align="center" px="3" py="2">
        {/* Contenedor de icono compacto (32×32) con tinte semántico soft. */}
        <Flex
          align="center"
          justify="center"
          width="32px"
          height="32px"
          flexShrink="0"
          style={{
            borderRadius: "var(--radius-3)",
            backgroundColor: isFire ? "var(--orange-a3)" : "var(--blue-a3)",
            color: isFire ? "var(--orange-11)" : "var(--blue-11)",
          }}
        >
          {isFire ? (
            <Flame size={16} strokeWidth={2} aria-hidden />
          ) : (
            <Waves size={16} strokeWidth={2} aria-hidden />
          )}
        </Flex>

        <Flex direction="column" style={{ minWidth: 0, flex: 1 }}>
          {/* Línea 1 — tipo unificado con el año en un solo renglón. */}
          <Flex align="baseline" gap="1">
            <Text size="2" weight="medium" highContrast>
              {isFire ? "Incendio" : "Inundación"}
            </Text>
            {Number.isFinite(year) && (
              <>
                <Text size="2" color="gray">
                  ·
                </Text>
                <Text size="2" weight="bold" color={isFire ? "orange" : "blue"}>
                  {year}
                </Text>
              </>
            )}
          </Flex>

          {/* Línea 2 — dato de impacto prominente + detalle sutil. */}
          <Flex align="baseline" gap="2" wrap="wrap">
            {impacto && (
              <Text size="2" weight="medium" highContrast>
                {impacto}
              </Text>
            )}
            {detalle && (
              <Text size="1" color="gray">
                {detalle}
              </Text>
            )}
          </Flex>
        </Flex>
      </Flex>
    </Card>
  );
}

/** Placeholder de una tarjeta de alerta mientras el endpoint resuelve. */
function AlertaSkeleton() {
  return (
    <Card size="1" variant="surface" style={{ padding: 0 }}>
      <Flex gap="3" align="center" px="3" py="2">
        <Skeleton
          style={{
            width: 32,
            height: 32,
            borderRadius: "var(--radius-3)",
            flexShrink: 0,
          }}
        />
        <Flex direction="column" gap="2" style={{ flex: 1 }}>
          <Skeleton style={{ height: 12, width: "45%" }} />
          <Skeleton style={{ height: 10, width: "80%" }} />
        </Flex>
      </Flex>
    </Card>
  );
}

export default function DashboardLote({
  data,
  onClear,
  ndviDataStatus,
  realHealthScore,
  ndviSerie,
  ndviSerieStatus,
  ndviPeriod,
  onNdviPeriodChange,
  onToggleLayer,
  layerVisible = false,
  incendiosStatus,
  incendiosReales,
  inundacionesStatus,
  inundacionesReales,
  elevacion,
  analisisCacheado,
  analisisActualizadoEn,
  analisisRefreshing = false,
  onRefreshAnalysis,
  loteGuardado = false,
  onRenameLote,
  onDeleteLote,
}: DashboardLoteProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // ── Editar nombre (inline) ──────────────────────────────────────────────
  const [isEditingNombre, setIsEditingNombre] = useState(false);
  const [nombreDraft, setNombreDraft] = useState(data.nombre);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // ── Eliminar lote (confirmación destructiva) ────────────────────────────
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const canEditNombre = Boolean(loteGuardado && onRenameLote);
  const canDeleteLote = Boolean(loteGuardado && onDeleteLote);

  const startEditNombre = () => {
    setNombreDraft(data.nombre);
    setRenameError(null);
    setIsEditingNombre(true);
  };

  const cancelEditNombre = () => {
    setIsEditingNombre(false);
    setRenameError(null);
  };

  const handleSubmitRename = async (event: FormEvent) => {
    event.preventDefault();
    if (!onRenameLote) return;

    const nuevo = nombreDraft.trim();
    if (!nuevo) {
      setRenameError("El nombre no puede quedar vacío.");
      return;
    }
    if (nuevo === data.nombre) {
      setIsEditingNombre(false);
      return;
    }

    setRenaming(true);
    setRenameError(null);
    try {
      await onRenameLote(data.id, nuevo);
      setIsEditingNombre(false);
    } catch (error) {
      setRenameError(
        error instanceof Error
          ? error.message
          : "No se pudo renombrar el lote.",
      );
    } finally {
      setRenaming(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!onDeleteLote) return;

    setDeleting(true);
    setDeleteError(null);
    try {
      await onDeleteLote(data.id);
      setConfirmDeleteOpen(false);
      // Limpieza del panel/mapa una vez confirmado el borrado en el backend.
      onClear();
    } catch (error) {
      setDeleteError(
        error instanceof Error ? error.message : "No se pudo eliminar el lote.",
      );
    } finally {
      setDeleting(false);
    }
  };

  // ── Estado NDVI (datos numéricos) ───────────────────────────────────────
  const ndviLoading = ndviDataStatus === "loading" || ndviDataStatus === "idle";
  const ndviReady = ndviDataStatus === "ready";
  const ndviErrored = ndviDataStatus === "error";

  // ── Estado serie del gráfico (período seleccionable, desacoplado del score) ─
  const serieLoading =
    ndviSerieStatus === "loading" || ndviSerieStatus === "idle";
  const serieReady = ndviSerieStatus === "ready";
  const serieErrored = ndviSerieStatus === "error";
  const periodoActual =
    NDVI_PERIODS.find((p) => p.id === ndviPeriod) ?? NDVI_PERIODS[0];

  // Score real: sólo cuando el fetch resolvió y hay categoría medible. La
  // categoría "Sin datos" (Sentinel sin escenas válidas) se trata aparte:
  // theme neutro, sin barra de progreso (sería engañosa).
  const scoreSinDatos =
    ndviReady &&
    (!realHealthScore || realHealthScore.categoria === "Sin datos");
  const hasRealScore = ndviReady && !scoreSinDatos && !!realHealthScore;

  const scoreTheme: ScoreTheme = hasRealScore
    ? getScoreTheme(realHealthScore!.score)
    : SIN_DATOS_THEME;
  const scoreLabel = hasRealScore
    ? `Salud ${realHealthScore!.categoria.toLowerCase()}`
    : scoreTheme.label;

  // ── Estado alertas (incendios + inundaciones) ───────────────────────────
  const incendiosLoading =
    incendiosStatus === "loading" || incendiosStatus === "idle";
  const inundacionesLoading =
    inundacionesStatus === "loading" || inundacionesStatus === "idle";
  const incendiosReady = incendiosStatus === "ready";
  const inundacionesReady = inundacionesStatus === "ready";
  const eventosInundacion = inundacionesReales?.length ?? 0;

  // ── Regla de recurrencia del recálculo manual (30 días) ─────────────────
  const diasDesdeAnalisis = analisisActualizadoEn
    ? diasDesde(analisisActualizadoEn)
    : null;
  const enCooldown =
    diasDesdeAnalisis !== null && diasDesdeAnalisis < ANALISIS_COOLDOWN_DIAS;
  const proximaFechaRecalculo =
    analisisActualizadoEn && enCooldown
      ? proximoRecalculo(analisisActualizadoEn)
      : null;
  const refreshDisabled =
    inundacionesLoading || analisisRefreshing || enCooldown;
  const refreshTooltip =
    enCooldown && proximaFechaRecalculo
      ? `El análisis es reciente. Podrás recalcular nuevamente el ${formatFechaLarga(proximaFechaRecalculo)}.`
      : "Buscar datos frescos en Google Earth Engine";

  const alertasIncendio: AlertaHistorica[] =
    incendiosReady && incendiosReales ? incendiosReales.map(eventoToAlerta) : [];
  const alertasInundacion: AlertaHistorica[] =
    inundacionesReady && inundacionesReales
      ? inundacionesReales.map(floodEventToAlerta)
      : [];
  const alertasMerged = [...alertasIncendio, ...alertasInundacion].sort(
    (a, b) => b.fecha.localeCompare(a.fecha),
  );

  const alertasLoading = incendiosLoading || inundacionesLoading;
  const bothSettled = !incendiosLoading && !inundacionesLoading;
  const showEmptyAlertas =
    bothSettled &&
    incendiosReady &&
    inundacionesReady &&
    alertasMerged.length === 0;

  const showLayerToggle = typeof onToggleLayer === "function";

  const handleConfirmClear = () => {
    onClear();
    setConfirmClearOpen(false);
  };

  return (
    <Flex
      asChild
      direction="column"
      height="100%"
      width="100%"
      className="agro-panel agro-surface"
      style={{ minHeight: 0 }}
    >
      <aside aria-label="Panel de historial del lote">
        <Box px="5" py="4" flexShrink="0">
          <Flex align="start" justify="between" gap="3">
            <Box style={{ minWidth: 0, flexGrow: 1 }}>
              {isEditingNombre ? (
                <form onSubmit={handleSubmitRename}>
                  <Flex direction="column" gap="2">
                    <Flex align="center" gap="2">
                      <TextField.Root
                        value={nombreDraft}
                        onChange={(e) => setNombreDraft(e.target.value)}
                        placeholder="Nombre del lote"
                        maxLength={120}
                        disabled={renaming}
                        autoFocus
                        size="2"
                        style={{ flexGrow: 1 }}
                        aria-label="Nombre del lote"
                      />
                      <Tooltip content="Guardar nombre">
                        <IconButton
                          type="submit"
                          variant="solid"
                          color="jade"
                          size="2"
                          radius="medium"
                          disabled={renaming || nombreDraft.trim().length === 0}
                          aria-label="Guardar nombre"
                        >
                          {renaming ? (
                            <Loader2
                              size={16}
                              className="animate-spin"
                              aria-hidden
                            />
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
                          size="2"
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
                <Flex align="center" gap="2">
                  <Heading size="4" weight="medium" truncate>
                    {data.nombre}
                  </Heading>
                  {canEditNombre && (
                    <Tooltip content="Editar nombre">
                      <IconButton
                        type="button"
                        variant="ghost"
                        color="gray"
                        size="1"
                        aria-label="Editar nombre del lote"
                        onClick={startEditNombre}
                        style={{ flexShrink: 0 }}
                      >
                        <Pencil size={14} aria-hidden />
                      </IconButton>
                    </Tooltip>
                  )}
                </Flex>
              )}
              <Text as="p" size="2" color="gray" mt="1">
                {formatHectareas(data.hectareas)} ha · Región Pampeana
              </Text>
            </Box>

            <Flex align="center" gap="1" flexShrink="0">
              {canDeleteLote && (
                <Tooltip content="Eliminar lote">
                  <IconButton
                  variant="soft"
                  color="gray"
                  style={{
                    cursor: "pointer",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.dataset.accentColor = "red";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.dataset.accentColor = "gray";
                  }}
                    type="button"
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
              <Tooltip content="Cerrar historial">
                <IconButton
                  type="button"
                  variant="soft"
                  color="gray"
                  size="2"
                  radius="medium"
                  aria-label="Cerrar panel y limpiar lote"
                  onClick={() => setConfirmClearOpen(true)}
                >
                  <X size={16} aria-hidden />
                </IconButton>
              </Tooltip>
            </Flex>
          </Flex>

          <AlertDialog.Root
            open={confirmClearOpen}
            onOpenChange={setConfirmClearOpen}
          >
            <AlertDialog.Content maxWidth="420px">
              <AlertDialog.Title>¿Restablecer búsqueda?</AlertDialog.Title>
              <AlertDialog.Description size="2">
                Se cerrará el historial de este lote y volverás al mapa para
                buscar o dibujar otro campo. Esta acción no se puede deshacer.
              </AlertDialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button variant="soft" color="gray">
                    Cancelar
                  </Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Button
                    variant="solid"
                    color="jade"
                    onClick={handleConfirmClear}
                  >
                    Sí, restablecer
                  </Button>
                </AlertDialog.Action>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>

          <AlertDialog.Root
            open={confirmDeleteOpen}
            onOpenChange={(open) => {
              // No permitimos cerrar el diálogo mientras el DELETE está en vuelo.
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
                  {data.nombre}
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
                {/*
                  No usamos AlertDialog.Action: cerraría el diálogo en el clic
                  y necesitamos mantenerlo abierto durante el request (spinner
                  + posible error inline). Cerramos manualmente al resolver.
                */}
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
                    <>
                      Eliminar definitivamente
                    </>
                  )}
                </Button>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Box>

        <Separator size="4" />

        <Box
          px="5"
          py="5"
          flexGrow="1"
          style={{ minHeight: 0, overflowY: "auto" }}
          className="scrollbar-none"
        >
          <Flex direction="column" gap="6">
            <Card size="2" variant="surface">
              <Flex direction="column" gap="3">
              
              {/* SECCIÓN SUPERIOR: TÍTULO Y SCORE */}
              <Flex justify="between" align="start" gap="3">
                <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
                  <Text
                    size="1"
                    weight="medium"
                    color="gray"
                    style={{
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                    }}
                  >
                    Score de salud actual
                  </Text>
                  <Text size="1" color="gray">
                    Sentinel-2 · último intervalo medido
                  </Text>
                </Flex>

                {ndviLoading && (
                  <Skeleton
                    style={{
                      height: 40,
                      width: 84,
                      borderRadius: 8,
                      flexShrink: 0,
                    }}
                  />
                )}
                {ndviReady && (
                  <Flex align="end" gap="1" flexShrink="0">
                    <Heading
                      size="8"
                      color={scoreTheme.color}
                      style={{ lineHeight: 1 }}
                    >
                      {hasRealScore ? realHealthScore!.score : "—"}
                    </Heading>
                    <Text size="3" color="gray" mb="1">
                      /100
                    </Text>
                  </Flex>
                )}
              </Flex>

              {/* ESTADOS DE CARGA Y ERROR */}
              {ndviLoading && (
                <Flex direction="column" gap="2">
                  <Skeleton style={{ height: 14, width: "40%" }} />
                  <Skeleton style={{ height: 8, width: "100%", borderRadius: 999 }} />
                </Flex>
              )}

              {ndviErrored && (
                <Callout.Root color="red" size="1" variant="soft">
                  <Callout.Icon>
                    <AlertTriangle size={16} aria-hidden />
                  </Callout.Icon>
                  <Callout.Text>
                    No se pudo calcular la salud del lote. Reintentá en unos instantes.
                  </Callout.Text>
                </Callout.Root>
              )}

              {/* DETALLES DE SALUD Y MÉTRICAS EN GRILLA OPTIMIZADA */}
              {ndviReady && (
                <>
                  <Text size="2" weight="medium" color={scoreTheme.color}>
                    {scoreLabel}
                  </Text>

                  {hasRealScore && (
                    <Flex direction="column" gap="3">
                      <Progress
                        value={realHealthScore!.score}
                        color={scoreTheme.color === "gray" ? "jade" : scoreTheme.color}
                        size="2"
                      />
                      
                      {/* Transformación a Grilla 2x2 centrando y ordenando los KPIs */}
                      <Grid columns="3" gap="3" pt="1">
                        <Flex direction="column" align="center" justify="center" style={{ textAlign: "center" }}>
                          <Text size="1" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            NDVI Promedio
                          </Text>
                          <Text size="2" weight="bold" highContrast>
                            {realHealthScore!.ndviPromedio !== null
                              ? realHealthScore!.ndviPromedio.toFixed(2)
                              : "N/D"}
                          </Text>
                        </Flex>

                        <Flex direction="column" align="center" justify="center" style={{ textAlign: "center" }}>
                          <Text size="1" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Área Sana
                          </Text>
                          <Text size="2" weight="bold" highContrast>
                            {realHealthScore!.score}%
                          </Text>
                        </Flex>

                        <Flex direction="column" align="center" justify="center" style={{ textAlign: "center" }}>
                          <Text size="1" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.05em" }}>
                            Superficie
                          </Text>
                          <Text size="2" weight="bold" highContrast>
                            {formatHectareas(realHealthScore!.totalHectareas)} ha
                          </Text>
                        </Flex>
                      </Grid>
                    </Flex>
                  )}

                  {scoreSinDatos && (
                    <Callout.Root color="amber" size="1" variant="soft">
                      <Callout.Icon>
                        <AlertTriangle size={16} aria-hidden />
                      </Callout.Icon>
                      <Callout.Text>
                        Sentinel-2 no encontró escenas válidas en el período (posible cobertura nubosa total).
                      </Callout.Text>
                    </Callout.Root>
                  )}
                </>
              )}

              {/* INTERACCIÓN CON CAPA (Se eliminó el Separator y se centró el texto descriptivo) */}
              {showLayerToggle && (
                <Flex direction="column" gap="2" pt="2">
                  <Button
                    type="button"
                    size="2"
                    variant={layerVisible ? "soft" : "solid"}
                    color={layerVisible ? "gray" : "jade"}
                    onClick={onToggleLayer}
                    disabled={!ndviReady}
                    aria-pressed={layerVisible}
                  >
                    {layerVisible ? (
                      <EyeOff size={16} aria-hidden />
                    ) : (
                      <Layers size={16} aria-hidden />
                    )}
                    {layerVisible ? "Ocultar capa de mapa" : "Mostrar capa en mapa"}
                  </Button>
                  
                  <Text size="1" color="gray" style={{ textAlign: "center" }}>
                    {ndviLoading
                      ? "Preparando capa NDVI…"
                      : "Superpone el NDVI (Sentinel-2) sobre el mapa."}
                  </Text>
                </Flex>
              )}
              </Flex>
            </Card>

            <Separator size="4" />

            {/* ── Gráfico NDVI ─────────────────────────────────────────── */}
            <Box>
              <Flex justify="between" align="center" gap="3">
                <Heading size="2" weight="medium" style={{ minWidth: 0 }} truncate>
                  Historial NDVI
                </Heading>
                <SegmentedControl.Root
                  size="1"
                  value={ndviPeriod}
                  onValueChange={(value) =>
                    onNdviPeriodChange(value as NDVIPeriodId)
                  }
                  aria-label="Período del gráfico NDVI"
                  style={{ flexShrink: 0 }}
                >
                  {NDVI_PERIODS.map((p) => (
                    <SegmentedControl.Item key={p.id} value={p.id}>
                      {p.label}
                    </SegmentedControl.Item>
                  ))}
                </SegmentedControl.Root>
              </Flex>
              <Text as="p" size="1" color="gray" mt="1" mb="3">
                Sentinel-2 L2A · {periodoActual.rangoLabel} · intervalos de 10
                días
              </Text>

              {serieLoading && (
                <Skeleton
                  style={{
                    height: 172,
                    width: "100%",
                    borderRadius: "var(--radius-3)",
                  }}
                />
              )}

              {serieErrored && (
                <Callout.Root color="red" size="1" variant="soft">
                  <Callout.Icon>
                    <AlertTriangle size={16} aria-hidden />
                  </Callout.Icon>
                  <Callout.Text>
                    No se pudo cargar la evolución del NDVI para este período.
                  </Callout.Text>
                </Callout.Root>
              )}

              {serieReady && <NDVITimeSeriesChart serie={ndviSerie} />}
            </Box>

            <Separator size="4" />

            {/* ── Terreno y agua (Google Earth Engine) ─────────────────── */}
            <Flex direction="column" gap="3">
              <Flex align="start" justify="between" gap="3">
                <Box style={{ minWidth: 0 }}>
                  <Heading size="2" weight="medium">
                    Terreno y agua
                  </Heading>
                  <Text as="p" size="1" color="gray" mt="1">
                    Google Earth Engine · elevación SRTM e historial de
                    inundaciones (GFD)
                  </Text>
                </Box>
                {onRefreshAnalysis && (
                  <Tooltip content={refreshTooltip}>
                    {/*
                      Envolvemos el Button en un <span>: un botón nativo
                      `disabled` no emite eventos de puntero, así que el
                      Tooltip de Radix no se mostraría justo cuando más lo
                      necesitamos (para explicar por qué está bloqueado). El
                      span recibe el hover y dispara el tooltip igual.
                    */}
                    <span style={{ display: "inline-flex", flexShrink: 0 }}>
                      <Button
                        type="button"
                        size="1"
                        variant="soft"
                        color="gray"
                        onClick={onRefreshAnalysis}
                        disabled={refreshDisabled}
                      >
                        <RefreshCw
                          size={14}
                          aria-hidden
                          className={
                            analisisRefreshing ? "animate-spin" : undefined
                          }
                        />
                        Actualizar
                      </Button>
                    </span>
                  </Tooltip>
                )}
              </Flex>

              {inundacionesLoading && !analisisRefreshing && (
                <Flex gap="3">
                  <Skeleton
                    style={{
                      height: 64,
                      flex: 1,
                      borderRadius: "var(--radius-3)",
                    }}
                  />
                  <Skeleton
                    style={{
                      height: 64,
                      flex: 1,
                      borderRadius: "var(--radius-3)",
                    }}
                  />
                </Flex>
              )}

              {inundacionesStatus === "error" && (
                <Callout.Root color="red" size="1" variant="soft">
                  <Callout.Icon>
                    <AlertTriangle size={16} aria-hidden />
                  </Callout.Icon>
                  <Callout.Text>
                    No se pudo cargar el análisis del terreno (Google Earth
                    Engine).
                  </Callout.Text>
                </Callout.Root>
              )}

              {(inundacionesReady || analisisRefreshing) && (
                <>
                  <Flex gap="3" wrap="wrap">
                    <Card
                      size="1"
                      variant="surface"
                      style={{ flex: "1 1 140px" }}
                    >
                      <Flex align="center" gap="2">
                        <Mountain
                          size={18}
                          color="var(--jade-11)"
                          aria-hidden
                        />
                        <Box style={{ minWidth: 0 }}>
                          <Text as="p" size="1" color="gray">
                            Elevación media
                          </Text>
                          <Text as="p" size="4" weight="medium">
                            {elevacion !== null
                              ? `${Math.round(elevacion)} m s.n.m.`
                              : "Sin datos"}
                          </Text>
                        </Box>
                      </Flex>
                    </Card>
                    <Card
                      size="1"
                      variant="surface"
                      style={{ flex: "1 1 140px" }}
                    >
                      <Flex align="center" gap="2">
                        <Waves size={18} color="var(--sky-11)" aria-hidden />
                        <Box style={{ minWidth: 0 }}>
                          <Text as="p" size="1" color="gray">
                            Inundaciones históricas
                          </Text>
                          <Text as="p" size="4" weight="medium">
                            {eventosInundacion}{" "}
                            {eventosInundacion === 1 ? "evento" : "eventos"}
                          </Text>
                        </Box>
                      </Flex>
                    </Card>
                  </Flex>
                  {analisisActualizadoEn && (
                    <Text size="1" color="gray">
                      {analisisRefreshing
                        ? "Actualizando…"
                        : analisisCacheado
                          ? "Último datos"
                          : "Ahora"}
                      {" · "}
                      actualizado {formatFechaHora(analisisActualizadoEn)}
                    </Text>
                  )}
                </>
              )}
            </Flex>

            <Separator size="4" />

            {/* ── Alertas críticas ─────────────────────────────────────── */}
            <Flex direction="column" gap="3">
              <Box>
                <Heading size="2" weight="medium">
                  Alertas críticas
                </Heading>
                <Text as="p" size="1" color="gray" mt="1">
                  Historial de incendios e inundaciones detectados en el lote.
                </Text>
              </Box>

              {incendiosStatus === "error" && (
                <Callout.Root color="red" size="1" variant="soft">
                  <Callout.Icon>
                    <AlertTriangle size={16} aria-hidden />
                  </Callout.Icon>
                  <Callout.Text>
                    No se pudieron cargar los focos de incendio (NASA FIRMS).
                  </Callout.Text>
                </Callout.Root>
              )}

              {inundacionesStatus === "error" && (
                <Callout.Root color="red" size="1" variant="soft">
                  <Callout.Icon>
                    <AlertTriangle size={16} aria-hidden />
                  </Callout.Icon>
                  <Callout.Text>
                    No se pudieron cargar las inundaciones (Global Flood
                    Database).
                  </Callout.Text>
                </Callout.Root>
              )}

              {(alertasMerged.length > 0 || alertasLoading) && (
                <Flex direction="column" gap="2" asChild>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {alertasMerged.map((alerta, idx) => (
                      <li key={`${alerta.tipo}-${alerta.fecha}-${idx}`}>
                        <AlertaItem alerta={alerta} />
                      </li>
                    ))}
                    {alertasLoading && (
                      <>
                        <li>
                          <AlertaSkeleton />
                        </li>
                        <li>
                          <AlertaSkeleton />
                        </li>
                      </>
                    )}
                  </ul>
                </Flex>
              )}

              {showEmptyAlertas && (
                <Card variant="ghost">
                  <Text size="1" color="gray" align="center" as="p">
                    No se registraron alertas críticas de incendios (últimos 5
                    años) ni de inundaciones (2000-2018) en este lote.
                  </Text>
                </Card>
              )}

              {alertasMerged.length > 0 && (
                <Text as="p" size="1" color="gray" style={{ opacity: 0.75 }}>
                  Fuentes: NASA FIRMS (incendios, últimos 5 años) · Global Flood
                  Database (inundaciones, 2000–2018).
                </Text>
              )}
            </Flex>
          </Flex>
        </Box>
      </aside>
    </Flex>
  );
}
