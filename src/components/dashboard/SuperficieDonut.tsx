"use client";

import type { MatrizRiesgoHidricoItem } from "@/services";
import { Box, Card, Flex, Heading, Skeleton, Text } from "@radix-ui/themes";
import { ChartPie } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { Cell, Pie, PieChart, Tooltip } from "recharts";

const CHART_HEIGHT = 176;
// Padding vertical del Card a la mitad del size 2 (space-4) para más densidad.
const CARD_PADDING: CSSProperties = { paddingBlock: "var(--space-2)" };
// Fuente secundaria un punto menor que `font-size-1` (respeta el scaling).
const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

/**
 * Paleta agro cohesiva (verdes/azules/teal) que cicla por lote. Usamos los
 * tokens de Radix (paso 9/10) para que el gráfico respete el tema oscuro.
 */
const PALETTE = [
  "var(--jade-9)",
  "var(--teal-9)",
  "var(--grass-9)",
  "var(--cyan-9)",
  "var(--green-10)",
  "var(--sky-9)",
  "var(--mint-9)",
  "var(--blue-9)",
  "var(--lime-9)",
  "var(--bronze-9)",
];

type DonutDatum = { id: string; name: string; value: number };

type DonutTooltipPayload = {
  name?: string;
  value?: number;
  payload?: DonutDatum;
};

type SuperficieDonutProps = {
  items: MatrizRiesgoHidricoItem[];
  onSelectLote: (loteId: string) => void;
};

function DonutTooltip({
  active,
  payload,
  total,
}: {
  active?: boolean;
  payload?: DonutTooltipPayload[];
  total: number;
}) {
  if (!active || !payload?.length) return null;

  const slice = payload[0];
  const value = slice.value ?? 0;
  const pct = total > 0 ? (value / total) * 100 : 0;

  return (
    <Card size="1" variant="surface" style={{ padding: "var(--space-2)" }}>
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          {slice.payload?.name ?? slice.name}
        </Text>
        <Text size="1" color="gray">
          <Text as="span" weight="medium" style={{ color: "var(--jade-11)" }}>
            {HECTAREAS_FMT.format(value)} ha
          </Text>
          {" · "}
          {pct.toFixed(1)}%
        </Text>
      </Flex>
    </Card>
  );
}

/** Cabecera (icono + título + subtítulo). Reutilizada por el skeleton. */
function DonutHeader() {
  return (
    <Box>
      <Flex align="center" gap="2">
        <ChartPie size={18} aria-hidden style={{ color: "var(--grass-11)" }} />
        <Heading size="4" weight="medium">
          Distribución de superficie
        </Heading>
      </Flex>
      <Text
        size="1"
        className="text-slate-400"
        style={{ fontSize: SECONDARY_FONT }}
      >
        Hectáreas por lote · clic para ver el lote.
      </Text>
    </Box>
  );
}

export function SuperficieDonut({
  items,
  onSelectLote,
}: SuperficieDonutProps) {
  // Medimos el ancho del contenedor y pasamos dimensiones explícitas al
  // PieChart. Evita el `ResponsiveContainer` (que loguea width(-1) en el
  // primer frame con StrictMode) y garantiza un render con tamaño positivo.
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartWidth, setChartWidth] = useState(0);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? 0;
      setChartWidth(width);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const data: DonutDatum[] = items
    .filter((lote) => lote.areaHectareas > 0)
    .map((lote) => ({
      id: lote.id,
      name: lote.nombre,
      value: lote.areaHectareas,
    }))
    .sort((a, b) => b.value - a.value);

  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <Card size="2" variant="surface" className="agro-surface" style={CARD_PADDING}>
      <Flex direction="column" gap="3">
        <DonutHeader />

        {data.length === 0 ? (
          <Box py="6">
            <Text size="2" className="text-slate-400" align="center" as="div">
              Sin superficie para graficar.
            </Text>
          </Box>
        ) : (
          <Box
            ref={containerRef}
            position="relative"
            className="min-w-0"
            style={{ height: CHART_HEIGHT, width: "100%" }}
          >
            {chartWidth > 0 && (
              <PieChart width={chartWidth} height={CHART_HEIGHT}>
                <Pie
                  data={data}
                  dataKey="value"
                  nameKey="name"
                  innerRadius="56%"
                  outerRadius="80%"
                  paddingAngle={1}
                  stroke="var(--color-panel-solid)"
                  strokeWidth={1.5}
                  cursor="pointer"
                  onClick={(_, index) => {
                    const slice = data[index];
                    if (slice) onSelectLote(slice.id);
                  }}
                  animationDuration={600}
                >
                  {data.map((d, i) => (
                    <Cell key={d.id} fill={PALETTE[i % PALETTE.length]} />
                  ))}
                </Pie>
                <Tooltip content={<DonutTooltip total={total} />} />
              </PieChart>
            )}

            {/* Total al centro de la dona (no intercepta clics de las porciones). */}
            <Flex
              direction="column"
              align="center"
              justify="center"
              style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
            >
              <Text
                size="1"
                className="text-slate-400"
                style={{ fontSize: SECONDARY_FONT }}
              >
                Total
              </Text>
              <Text
                size="5"
                weight="bold"
                highContrast
                style={{ lineHeight: 1.1 }}
              >
                {HECTAREAS_FMT.format(total)}
              </Text>
              <Text
                size="1"
                className="text-slate-400"
                style={{ fontSize: SECONDARY_FONT }}
              >
                ha
              </Text>
            </Flex>
          </Box>
        )}
      </Flex>
    </Card>
  );
}

/** Skeleton de la dona: cabecera real + anillo placeholder centrado. */
export function SuperficieDonutSkeleton() {
  return (
    <Card size="2" variant="surface" className="agro-surface" style={CARD_PADDING}>
      <Flex direction="column" gap="3">
        <DonutHeader />
        <Flex align="center" justify="center" style={{ height: CHART_HEIGHT }}>
          <Skeleton
            style={{ width: 132, height: 132, borderRadius: "50%" }}
          />
        </Flex>
      </Flex>
    </Card>
  );
}
