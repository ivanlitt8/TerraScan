"use client";

import NDVIChart from "@/components/NDVIChart";
import NDVITimeSeriesChart from "@/components/NDVITimeSeriesChart";
import {
  confianzaLabel,
  type IncendioEvento,
} from "@/lib/incendiosClustering";
import type { HealthScoreSummary, NDVIStatPoint } from "@/services";
import type { AlertaHistorica, LoteAnalysisResult } from "@/types/loteAnalysis";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  IconButton,
  Progress,
  Separator,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import {
  Activity,
  EyeOff,
  Flame,
  Loader2,
  RotateCcw,
  Waves,
  X,
} from "lucide-react";
import { useState } from "react";

export type NDVIToggleState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "ready" }
  | { phase: "error"; message: string };

type DashboardLoteProps = {
  data: LoteAnalysisResult;
  onClear: () => void;
  /**
   * Toggle controlado del overlay NDVI sobre el mapa. El padre
   * (`MapaWorkspace`) maneja el state y le pasa la fase actual al panel.
   * Si los tres props son `undefined`, el botón queda oculto: útil para
   * pantallas donde no hay mapa al lado (preview, share, etc.).
   */
  ndviEnabled?: boolean;
  ndviStatus?: NDVIToggleState;
  onToggleNDVI?: () => void;
  /**
   * Serie temporal NDVI real (Sentinel-2 L2A, intervalos `P10D`). Cuando
   * el hook `useNDVILayer` resuelve y `stats.length > 0`, el panel sustituye
   * el `NDVIChart` histórico (mock por campañas anuales) por el chart real
   * `NDVITimeSeriesChart` (por fecha). Si está vacío o `undefined`, se
   * muestra el histórico — el campo es retrocompatible.
   */
  ndviStats?: NDVIStatPoint[];
  /**
   * Score de salud real del lote (último intervalo válido de Sentinel)
   * + categoría y contexto agronómico (NDVI promedio, hectáreas, fecha).
   * Si está presente, el bloque "Score de salud" usa este valor en vez
   * del mock `data.scoreSalud`. `undefined`/`null` → fallback al mock
   * para que la UI siga funcionando antes de activar la capa NDVI.
   */
  realHealthScore?: HealthScoreSummary | null;
  /**
   * Eventos de incendio reales (NASA FIRMS, ya deduplicados entre
   * SNPP y NOAA-20). Cuando es un array (incluso vacío) significa que
   * el hook resolvió y las alertas mock de tipo `incendio` deben ser
   * reemplazadas. `undefined`/`null` → seguir mostrando el mock de
   * incendios mientras carga / falla la integración.
   *
   * Las alertas de tipo `inundacion` siguen siendo mock en cualquier
   * caso porque todavía no integramos Sentinel-1 SAR.
   */
  incendiosReales?: IncendioEvento[] | null;
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

function yearFromFecha(fecha: string): number {
  return new Date(fecha).getFullYear();
}

function groupYearsByTipo(
  alertas: AlertaHistorica[],
  tipo: AlertaHistorica["tipo"],
) {
  const years = alertas
    .filter((a) => a.tipo === tipo)
    .map((a) => yearFromFecha(a.fecha))
    .sort((a, b) => a - b);

  return [...new Set(years)];
}

/**
 * Convierte un evento FIRMS deduplicado a una `AlertaHistorica` que
 * `<AlertaItem />` pueda renderizar sin cambios. La descripción
 * acumula la información agronómica relevante (satélites que lo vieron,
 * FRP máximo, confianza, cuántas detecciones lo componen) para que el
 * usuario entienda el contexto sin tener que abrir el detalle del píxel.
 */
function eventoToAlerta(evento: IncendioEvento): AlertaHistorica {
  const partes: string[] = [];

  partes.push(
    evento.satelites.length > 1
      ? `Detectado por ${evento.satelites.join(" + ")}`
      : `Detectado por ${evento.satelites[0]}`,
  );

  if (evento.frpMax != null) {
    partes.push(`FRP máx ${evento.frpMax.toFixed(1)} MW`);
  }

  const confianza = confianzaLabel(evento.confianzaMax);
  if (confianza) {
    partes.push(`confianza ${confianza}`);
  }

  if (evento.detecciones.length > 1) {
    partes.push(`${evento.detecciones.length} detecciones`);
  }

  return {
    tipo: "incendio",
    fecha: evento.fecha,
    descripcion: partes.join(" · "),
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

  return (
    <Card size="1" variant="surface">
      <Flex gap="3" align="start">
        <Flex
          align="center"
          justify="center"
          width="40px"
          height="40px"
          flexShrink="0"
          style={{
            borderRadius: "var(--radius-full)",
            backgroundColor: isFire
              ? "var(--orange-a3)"
              : "var(--sky-a3)",
            color: isFire ? "var(--orange-11)" : "var(--sky-11)",
          }}
        >
          {isFire ? (
            <Flame size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <Waves size={20} strokeWidth={1.75} aria-hidden />
          )}
        </Flex>
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap="2" wrap="wrap">
            <Text size="2" weight="medium">
              {isFire ? "Incendio" : "Inundación"}
            </Text>
            <Badge color={isFire ? "orange" : "sky"} variant="soft" radius="full">
              {year}
            </Badge>
            <Text size="1" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {isFire ? "NASA FIRMS" : "Sentinel-1 SAR"}
            </Text>
          </Flex>
          <Text size="1" color="gray">
            {alerta.descripcion}
          </Text>
        </Flex>
      </Flex>
    </Card>
  );
}

export default function DashboardLote({
  data,
  onClear,
  ndviEnabled,
  ndviStatus,
  onToggleNDVI,
  ndviStats,
  realHealthScore,
  incendiosReales,
}: DashboardLoteProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);

  // Cuando `incendiosReales` es un array (incluso vacío) significa que
  // el endpoint FIRMS ya respondió: usamos los eventos deduplicados y
  // descartamos las alertas mock de tipo "incendio". Las inundaciones
  // siguen siendo mock siempre (Sentinel-1 SAR pendiente).
  const hasRealIncendios = Array.isArray(incendiosReales);

  const alertasIncendio: AlertaHistorica[] = hasRealIncendios
    ? incendiosReales!.map(eventoToAlerta)
    : data.alertas.filter((a) => a.tipo === "incendio");
  const alertasInundacion = data.alertas.filter((a) => a.tipo === "inundacion");
  const alertasMerged = [...alertasIncendio, ...alertasInundacion].sort(
    (a, b) => b.fecha.localeCompare(a.fecha),
  );

  const incendioYears = hasRealIncendios
    ? [...new Set(incendiosReales!.map((e) => yearFromFecha(e.fecha)))].sort(
        (a, b) => a - b,
      )
    : groupYearsByTipo(data.alertas, "incendio");
  const inundacionYears = groupYearsByTipo(data.alertas, "inundacion");

  const totalDeteccionesFirms = hasRealIncendios
    ? incendiosReales!.reduce((sum, e) => sum + e.detecciones.length, 0)
    : 0;

  const showNdviToggle = typeof onToggleNDVI === "function";
  const ndviLoading = ndviStatus?.phase === "loading";
  const ndviError =
    ndviStatus?.phase === "error" ? ndviStatus.message : null;

  // Mostramos el chart real (Sentinel-2 últimos 30 días) cuando el hook
  // resolvió y devolvió puntos. Fuera de eso seguimos mostrando el mock
  // histórico por campañas anuales, que cumple la función "placeholder"
  // hasta que el backend integre series multi-año.
  const hasRealStats = (ndviStats?.length ?? 0) > 0;

  // El score real reemplaza al mock cuando el backend ya respondió. La
  // categoría textual puede venir como "Sin datos" si Sentinel no encontró
  // escenas válidas en el rango: en ese caso usamos un theme neutro y NO
  // mostramos la barra de progreso, que sería engañosa.
  const hasRealScore =
    !!realHealthScore && realHealthScore.categoria !== "Sin datos";
  const displayScore = hasRealScore
    ? realHealthScore!.score
    : data.scoreSalud;
  const scoreTheme = hasRealScore
    ? getScoreTheme(displayScore)
    : realHealthScore?.categoria === "Sin datos"
      ? SIN_DATOS_THEME
      : getScoreTheme(displayScore);
  const scoreLabel = hasRealScore
    ? `Salud ${realHealthScore!.categoria.toLowerCase()}`
    : scoreTheme.label;
  const scoreSubtitle = hasRealScore
    ? "Sentinel-2 · último intervalo medido"
    : "Cálculo histórico (placeholder)";

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
      style={{ minHeight: 0, background: "var(--gray-1)" }}
    >
      <aside aria-label="Panel de historial del lote">
        <Box px="5" py="4" flexShrink="0">
          <Flex align="center" justify="between" gap="3">
            <Box style={{ minWidth: 0 }}>
              <Heading size="4" weight="medium">
                Historial del lote
              </Heading>
              <Text as="p" size="2" color="gray" mt="1">
                {formatHectareas(data.hectareas)} ha · Región Pampeana
              </Text>
            </Box>

            <Flex align="center" gap="1" flexShrink="0">
              <Tooltip content="Restablecer búsqueda">
                <IconButton
                  type="button"
                  variant="soft"
                  color="gray"
                  size="2"
                  radius="medium"
                  aria-label="Restablecer búsqueda"
                  onClick={() => setConfirmClearOpen(true)}
                >
                  <RotateCcw size={16} aria-hidden />
                </IconButton>
              </Tooltip>
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

          <AlertDialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
            <AlertDialog.Content maxWidth="420px">
              <AlertDialog.Title>¿Restablecer búsqueda?</AlertDialog.Title>
              <AlertDialog.Description size="2">
                Se cerrará el historial de este lote y volverás al mapa para buscar o
                dibujar otro campo. Esta acción no se puede deshacer.
              </AlertDialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button variant="soft" color="gray">
                    Cancelar
                  </Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Button variant="solid" color="jade" onClick={handleConfirmClear}>
                    Sí, restablecer
                  </Button>
                </AlertDialog.Action>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Box>

        <Separator size="4" />

        <Box px="5" py="4" flexShrink="0">
          <Card size="2" variant="surface">
            <Flex direction="column" gap="3">
              <Flex direction="column" gap="1">
                <Text
                  size="1"
                  weight="medium"
                  color="gray"
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                  }}
                >
                  {hasRealScore ? "Score de salud actual" : "Score de salud histórica"}
                </Text>
                <Text size="1" color="gray">
                  {scoreSubtitle}
                </Text>
              </Flex>
              <Flex align="end" gap="2">
                <Heading
                  size="8"
                  color={scoreTheme.color}
                  style={{ lineHeight: 1 }}
                >
                  {displayScore}
                </Heading>
                <Text size="4" color="gray" mb="1">
                  /100
                </Text>
              </Flex>
              <Text size="2" weight="medium" color={scoreTheme.color}>
                {scoreLabel}
              </Text>
              {realHealthScore?.categoria !== "Sin datos" && (
                <Progress
                  value={displayScore}
                  color={
                    scoreTheme.color === "gray" ? "jade" : scoreTheme.color
                  }
                  size="2"
                />
              )}

              {hasRealScore && (
                <Flex
                  direction="column"
                  gap="1"
                  pt="1"
                  style={{ borderTop: "1px solid var(--gray-a4)" }}
                >
                  <Text size="1" color="gray">
                    <Text as="span" size="1" color="gray" weight="medium">
                      % área sana:
                    </Text>{" "}
                    {displayScore}% del lote con NDVI &gt; 0.3
                  </Text>
                  {realHealthScore!.ndviPromedio !== null && (
                    <Text size="1" color="gray">
                      <Text as="span" size="1" color="gray" weight="medium">
                        NDVI promedio:
                      </Text>{" "}
                      {realHealthScore!.ndviPromedio.toFixed(2)}
                    </Text>
                  )}
                  <Text size="1" color="gray">
                    <Text as="span" size="1" color="gray" weight="medium">
                      Área total:
                    </Text>{" "}
                    {formatHectareas(realHealthScore!.totalHectareas)} ha
                  </Text>
                  {realHealthScore!.fechaReferencia && (
                    <Text size="1" color="gray">
                      <Text as="span" size="1" color="gray" weight="medium">
                        Última medición:
                      </Text>{" "}
                      {formatFechaCorta(realHealthScore!.fechaReferencia)}
                    </Text>
                  )}
                </Flex>
              )}

              {realHealthScore?.categoria === "Sin datos" && (
                <Callout.Root color="amber" size="1" variant="soft">
                  <Callout.Text>
                    Sentinel-2 no encontró escenas válidas en el período
                    (posible cobertura nubosa total). Mostrando placeholder
                    histórico mientras llegan datos.
                  </Callout.Text>
                </Callout.Root>
              )}

              {showNdviToggle && (
                <>
                  <Separator size="4" my="1" />
                  <Flex direction="column" gap="2">
                    <Button
                      type="button"
                      size="2"
                      variant={ndviEnabled ? "soft" : "solid"}
                      color={ndviEnabled ? "gray" : "jade"}
                      onClick={onToggleNDVI}
                      disabled={ndviLoading}
                      aria-pressed={ndviEnabled}
                    >
                      {ndviLoading ? (
                        <Loader2
                          size={16}
                          className="animate-spin"
                          aria-hidden
                        />
                      ) : ndviEnabled ? (
                        <EyeOff size={16} aria-hidden />
                      ) : (
                        <Activity size={16} aria-hidden />
                      )}
                      {ndviLoading
                        ? "Generando NDVI…"
                        : ndviEnabled
                          ? "Ocultar capa NDVI"
                          : "Ver salud NDVI"}
                    </Button>
                    <Text size="1" color="gray">
                      Imagen Sentinel-2 (últimos 30 días) con paleta semáforo:
                      rojo = estrés, verde oscuro = vegetación vigorosa.
                    </Text>
                    {ndviError && (
                      <Callout.Root color="red" size="1" variant="soft">
                        <Callout.Text>{ndviError}</Callout.Text>
                      </Callout.Root>
                    )}
                  </Flex>
                </>
              )}
            </Flex>
          </Card>
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
            {hasRealStats && ndviStats ? (
              <NDVITimeSeriesChart serie={ndviStats} />
            ) : (
              <NDVIChart serie={data.ndviSerie} />
            )}

            <Flex direction="column" gap="3">
              <Box>
                <Heading size="2" weight="medium">
                  Alertas críticas
                </Heading>
                <Text as="p" size="1" color="gray" mt="1">
                  {hasRealIncendios
                    ? "Focos térmicos NASA FIRMS (VIIRS · SNPP + NOAA-20) deduplicados · últimos 5 años"
                    : "Eventos históricos detectados en el lote"}
                </Text>
              </Box>

              {(incendioYears.length > 0 || inundacionYears.length > 0) && (
                <Flex gap="2" wrap="wrap">
                  {incendioYears.length > 0 && (
                    <Badge color="orange" variant="soft" radius="full" size="2">
                      <Flex align="center" gap="1" as="span">
                        <Flame size={14} strokeWidth={1.75} aria-hidden />
                        Incendios: {incendioYears.join(", ")}
                      </Flex>
                    </Badge>
                  )}
                  {inundacionYears.length > 0 && (
                    <Badge color="sky" variant="soft" radius="full" size="2">
                      <Flex align="center" gap="1" as="span">
                        <Waves size={14} strokeWidth={1.75} aria-hidden />
                        Inundaciones: {inundacionYears.join(", ")}
                      </Flex>
                    </Badge>
                  )}
                </Flex>
              )}

              {hasRealIncendios && alertasIncendio.length > 0 && (
                <Text size="1" color="gray">
                  {alertasIncendio.length}{" "}
                  {alertasIncendio.length === 1 ? "evento" : "eventos"} de
                  incendio · {totalDeteccionesFirms}{" "}
                  {totalDeteccionesFirms === 1 ? "detección" : "detecciones"}{" "}
                  cruda
                  {totalDeteccionesFirms === 1 ? "" : "s"} agrupada
                  {totalDeteccionesFirms === 1 ? "" : "s"}.
                </Text>
              )}

              {alertasMerged.length > 0 && (
                <Flex direction="column" gap="2" asChild>
                  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                    {alertasMerged.map((alerta, idx) => (
                      <li key={`${alerta.tipo}-${alerta.fecha}-${idx}`}>
                        <AlertaItem alerta={alerta} />
                      </li>
                    ))}
                  </ul>
                </Flex>
              )}

              {hasRealIncendios && alertasIncendio.length === 0 && (
                <Callout.Root size="1" color="jade" variant="soft">
                  <Callout.Text>
                    Sin focos térmicos detectados por NASA FIRMS en los
                    últimos 5 años.
                  </Callout.Text>
                </Callout.Root>
              )}

              {alertasMerged.length === 0 && !hasRealIncendios && (
                <Card variant="ghost">
                  <Text size="1" color="gray" align="center">
                    No se registraron alertas críticas en el período analizado.
                  </Text>
                </Card>
              )}
            </Flex>
          </Flex>
        </Box>
      </aside>
    </Flex>
  );
}
