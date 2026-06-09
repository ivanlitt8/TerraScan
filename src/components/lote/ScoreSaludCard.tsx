"use client";

import type { SaludLotePhase } from "@/hooks/useSaludLote";
import type { HealthScoreSummary } from "@/services";
import {
  Box,
  Callout,
  Card,
  Flex,
  Grid,
  Heading,
  Progress,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { AlertTriangle } from "lucide-react";

const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

type ScoreColor = "jade" | "amber" | "red" | "gray";

/**
 * Cortes sincronizados con `healthCategoria` del backend y con
 * `getScoreTheme` de `DashboardLote` (>=70 alta, >=40 media, <40 baja).
 */
function scoreTheme(score: number): { color: ScoreColor; label: string } {
  if (score >= 70) return { color: "jade", label: "Salud alta" };
  if (score >= 40) return { color: "amber", label: "Salud media" };
  return { color: "red", label: "Salud baja" };
}

type ScoreSaludCardProps = {
  phase: SaludLotePhase;
  healthScore: HealthScoreSummary | null;
  error: string | null;
};

export function ScoreSaludCard({
  phase,
  healthScore,
  error,
}: ScoreSaludCardProps) {
  const isLoading = phase === "loading" || phase === "idle";
  const isReady = phase === "ready";
  const sinDatos =
    isReady && (!healthScore || healthScore.categoria === "Sin datos");
  const hasScore = isReady && !sinDatos && !!healthScore;
  const theme = hasScore
    ? scoreTheme(healthScore!.score)
    : { color: "gray" as ScoreColor, label: "Sin datos" };

  return (
    <Card size="2" variant="surface">
      <Flex direction="column" gap="3">
        <Flex justify="between" align="start" gap="3">
          <Box style={{ minWidth: 0 }}>
            <Text
              size="1"
              color="gray"
              weight="medium"
              style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}
            >
              Score de salud actual
            </Text>
            <Text
              as="div"
              size="1"
              className="text-slate-400"
              style={{ fontSize: SECONDARY_FONT }}
            >
              Sentinel-2 · último intervalo medido
            </Text>
          </Box>

          {isLoading && (
            <Skeleton style={{ height: 36, width: 74, borderRadius: 8 }} />
          )}
          {isReady && (
            <Flex align="end" gap="1" flexShrink="0">
              <Heading size="7" color={theme.color} style={{ lineHeight: 1 }}>
                {hasScore ? healthScore!.score : "—"}
              </Heading>
              <Text size="2" color="gray" mb="1">
                /100
              </Text>
            </Flex>
          )}
        </Flex>

        {isLoading && (
          <Flex direction="column" gap="2">
            <Skeleton style={{ height: 12, width: "40%" }} />
            <Skeleton style={{ height: 8, width: "100%", borderRadius: 999 }} />
          </Flex>
        )}

        {phase === "error" && (
          <Callout.Root color="red" size="1" variant="soft">
            <Callout.Icon>
              <AlertTriangle size={16} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              {error ?? "No se pudo calcular la salud del lote."}
            </Callout.Text>
          </Callout.Root>
        )}

        {hasScore && (
          <Flex direction="column" gap="3">
            <Text size="2" weight="medium" color={theme.color}>
              {theme.label}
            </Text>
            <Progress
              value={healthScore!.score}
              color={theme.color === "gray" ? "jade" : theme.color}
              size="2"
            />
            <Grid columns="3" gap="2" pt="1">
              <ScoreKpi
                label="NDVI prom."
                value={
                  healthScore!.ndviPromedio !== null
                    ? healthScore!.ndviPromedio.toFixed(2)
                    : "N/D"
                }
              />
              <ScoreKpi label="Área sana" value={`${healthScore!.score}%`} />
              <ScoreKpi
                label="Superficie"
                value={`${HECTAREAS_FMT.format(healthScore!.totalHectareas)} ha`}
              />
            </Grid>
          </Flex>
        )}

        {sinDatos && (
          <Callout.Root color="amber" size="1" variant="soft">
            <Callout.Icon>
              <AlertTriangle size={16} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              Sentinel-2 no encontró escenas válidas en el período (posible
              cobertura nubosa total).
            </Callout.Text>
          </Callout.Root>
        )}
      </Flex>
    </Card>
  );
}

function ScoreKpi({ label, value }: { label: string; value: string }) {
  return (
    <Flex direction="column" align="center" style={{ textAlign: "center" }}>
      <Text
        size="1"
        color="gray"
        style={{
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          fontSize: SECONDARY_FONT,
        }}
      >
        {label}
      </Text>
      <Text size="2" weight="bold" highContrast>
        {value}
      </Text>
    </Flex>
  );
}
