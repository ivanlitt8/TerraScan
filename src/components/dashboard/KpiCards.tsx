"use client";

import type { DashboardKpis } from "@/services";
import { Badge, Card, Flex, Grid, Skeleton, Text } from "@radix-ui/themes";
import { Droplets, Flame, LandPlot, Ruler, type LucideIcon } from "lucide-react";
import type { CSSProperties } from "react";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

// Padding compacto compartido (Card + skeleton): vertical a la mitad del
// horizontal para una cabecera ultra-chata.
const CARD_PADDING: CSSProperties = {
  paddingInline: "var(--space-3)",
  paddingBlock: "calc(var(--space-3) / 2)",
};

// Fuente secundaria un punto menor que `font-size-1` (respeta el scaling).
const LABEL_FONT_SIZE = "calc(var(--font-size-1) - 1px)";

type KpiTone = "jade" | "grass" | "sky" | "red" | "gray";

type KpiCardConfig = {
  key: string;
  label: string;
  value: string;
  icon: LucideIcon;
  tone: KpiTone;
  /** Tinte de alerta (rojo) cuando hay un valor crítico. */
  alert?: boolean;
};

/** Color del icono (sutil) y del número (temático) según el tono. */
function toneColors(tone: KpiTone): { icon: string; value: string } {
  if (tone === "gray") {
    return { icon: "var(--gray-a9)", value: "var(--gray-12)" };
  }
  return { icon: `var(--${tone}-a10)`, value: `var(--${tone}-11)` };
}

function buildCards(kpis: DashboardKpis): KpiCardConfig[] {
  const hayIncendios = kpis.lotesConIncendiosRecientes > 0;
  return [
    {
      key: "lotes",
      label: "Lotes monitoreados",
      value: String(kpis.totalLotes),
      icon: LandPlot,
      tone: "jade",
    },
    {
      key: "hectareas",
      label: "Superficie total",
      value: `${HECTAREAS_FMT.format(kpis.totalHectareas)} ha`,
      icon: Ruler,
      tone: "grass",
    },
    {
      key: "riesgo-hidrico",
      label: "Lotes con riesgo hídrico",
      value: String(kpis.lotesConRiesgoHidrico),
      icon: Droplets,
      tone: "sky",
    },
    {
      key: "incendios",
      label: "Incendios recientes (30 d)",
      value: String(kpis.lotesConIncendiosRecientes),
      icon: Flame,
      tone: hayIncendios ? "red" : "gray",
      alert: hayIncendios,
    },
  ];
}

export function KpiCards({ kpis }: { kpis: DashboardKpis }) {
  const cards = buildCards(kpis);

  return (
    <Grid columns={{ initial: "1", xs: "2", lg: "4" }} gap="4">
      {cards.map(({ key, label, value, icon: Icon, tone, alert }) => {
        const colors = toneColors(tone);
        return (
          <Card
            key={key}
            size="1"
            variant="surface"
            className="agro-surface"
            style={
              alert
                ? { ...CARD_PADDING, boxShadow: "inset 0 0 0 1px var(--red-7)" }
                : CARD_PADDING
            }
          >
            <Flex direction="column" gap="1">
              <Flex align="center" justify="between" width="100%" gap="2">
                <Text
                  size="1"
                  color="gray"
                  weight="medium"
                  style={{
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    fontSize: LABEL_FONT_SIZE,
                  }}
                >
                  {label}
                </Text>
                <Icon
                  size={16}
                  strokeWidth={2}
                  aria-hidden
                  style={{ flexShrink: 0, color: colors.icon }}
                />
              </Flex>

              <Flex align="center" gap="2" wrap="wrap">
                <Text
                  size="6"
                  weight="bold"
                  style={{ lineHeight: 1, color: colors.value }}
                >
                  {value}
                </Text>
                {alert && (
                  <Badge color="red" variant="soft" radius="full">
                    Alerta
                  </Badge>
                )}
              </Flex>
            </Flex>
          </Card>
        );
      })}
    </Grid>
  );
}

/** Skeleton de la fila de KPIs (misma estructura compacta que `KpiCards`). */
export function KpiCardsSkeleton() {
  return (
    <Grid columns={{ initial: "1", xs: "2", lg: "4" }} gap="4">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card
          key={i}
          size="1"
          variant="surface"
          className="agro-surface"
          style={CARD_PADDING}
        >
          <Flex direction="column" gap="1">
            <Flex align="center" justify="between" width="100%" gap="2">
              <Skeleton style={{ height: 10, width: "60%" }} />
              <Skeleton style={{ height: 16, width: 16 }} />
            </Flex>
            <Skeleton style={{ height: 26, width: "45%" }} />
          </Flex>
        </Card>
      ))}
    </Grid>
  );
}
