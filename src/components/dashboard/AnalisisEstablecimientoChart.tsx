"use client";

import type { MatrizRiesgoHidricoItem } from "@/services";
import { Box, Card, Flex, Heading, Skeleton, Text } from "@radix-ui/themes";
import { BarChart3 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { CSSProperties } from "react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

/** Alto mínimo del área de dibujo: por debajo el gráfico pierde legibilidad. */
const MIN_CHART_HEIGHT = 150;
const CARD_PADDING: CSSProperties = { paddingBlock: "var(--space-2)" };
const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

const SIN_CAMPO_LABEL = "Sin campo";

const COLOR_HECTAREAS = "var(--sky-9)";
const COLOR_SCORE = "var(--jade-10)";
const AXIS_TICK = "var(--gray-a11)";
const GRID_STROKE = "var(--gray-a4)";

type EstablecimientoDatum = {
  id: string;
  nombre: string;
  hectareas: number;
  /** Promedio de score (0–100) sobre los lotes con score; `null` si ninguno. */
  score: number | null;
  totalLotes: number;
};

type ChartTooltipPayload = {
  payload?: EstablecimientoDatum;
};

type AnalisisEstablecimientoChartProps = {
  /** Lotes ya filtrados por el selector global de la cabecera. */
  items: MatrizRiesgoHidricoItem[];
};

/**
 * Agrupa los lotes por establecimiento con `.reduce()`: sumatoria de hectáreas
 * y promedio del health score (ignorando lotes sin score). Los lotes sin campo
 * se consolidan bajo "Sin campo".
 */
function agruparPorEstablecimiento(
  items: MatrizRiesgoHidricoItem[],
): EstablecimientoDatum[] {
  const acc = new Map<
    string,
    { nombre: string; hectareas: number; scoreSum: number; scoreCount: number; totalLotes: number }
  >();

  for (const lote of items) {
    const key = lote.establecimientoId ?? "__sin_campo__";
    const nombre = lote.establecimientoNombre ?? SIN_CAMPO_LABEL;
    const prev =
      acc.get(key) ??
      { nombre, hectareas: 0, scoreSum: 0, scoreCount: 0, totalLotes: 0 };

    prev.hectareas += lote.areaHectareas;
    prev.totalLotes += 1;
    if (lote.score !== null && Number.isFinite(lote.score)) {
      prev.scoreSum += lote.score;
      prev.scoreCount += 1;
    }
    acc.set(key, prev);
  }

  return Array.from(acc.entries())
    .map(([id, v]) => ({
      id,
      nombre: v.nombre,
      hectareas: Number(v.hectareas.toFixed(1)),
      score: v.scoreCount > 0 ? Number((v.scoreSum / v.scoreCount).toFixed(0)) : null,
      totalLotes: v.totalLotes,
    }))
    .sort((a, b) => b.hectareas - a.hectareas);
}

function ChartHeader() {
  return (
    <Box>
      <Flex align="center" gap="2">
        <BarChart3 size={18} aria-hidden style={{ color: "var(--sky-11)" }} />
        <Heading size="4" weight="medium">
          Análisis por establecimiento
        </Heading>
      </Flex>
      <Text size="1" className="text-slate-400" style={{ fontSize: SECONDARY_FONT }}>
        Superficie total (ha) y score de salud promedio por campo.
      </Text>
    </Box>
  );
}

function ChartTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: ChartTooltipPayload[];
}) {
  if (!active || !payload?.length) return null;
  const datum = payload[0]?.payload;
  if (!datum) return null;

  return (
    <Card size="1" variant="surface" style={{ padding: "var(--space-2)" }}>
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          {datum.nombre}
        </Text>
        <Text size="1" color="gray">
          <Text as="span" weight="medium" style={{ color: "var(--sky-11)" }}>
            {HECTAREAS_FMT.format(datum.hectareas)} ha
          </Text>
          {" · "}
          {datum.totalLotes} {datum.totalLotes === 1 ? "lote" : "lotes"}
        </Text>
        <Text size="1" color="gray">
          Score promedio:{" "}
          <Text as="span" weight="medium" style={{ color: "var(--jade-11)" }}>
            {datum.score !== null ? `${datum.score}/100` : "Sin datos"}
          </Text>
        </Text>
      </Flex>
    </Card>
  );
}

export function AnalisisEstablecimientoChart({
  items,
}: AnalisisEstablecimientoChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [chartSize, setChartSize] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      setChartSize({
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
      });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const data = agruparPorEstablecimiento(items);

  // El alto se adapta al espacio disponible (la card llena la columna), con un
  // piso para no degradar la legibilidad.
  const chartHeight = Math.max(Math.floor(chartSize.height), MIN_CHART_HEIGHT);

  return (
    <Card
      size="2"
      variant="surface"
      className="agro-surface h-full"
      style={CARD_PADDING}
    >
      <Flex direction="column" gap="3" className="h-full min-h-0">
        <ChartHeader />

        {data.length === 0 ? (
          <Box py="6">
            <Text size="2" className="text-slate-400" align="center" as="div">
              Sin lotes para agrupar por establecimiento.
            </Text>
          </Box>
        ) : (
          <Box
            ref={containerRef}
            className="min-w-0 min-h-0 flex-1"
            style={{ width: "100%", minHeight: MIN_CHART_HEIGHT }}
          >
            {chartSize.width > 0 && (
              <ComposedChart
                width={chartSize.width}
                height={chartHeight}
                data={data}
                margin={{ top: 8, right: 8, bottom: 4, left: -8 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
                <XAxis
                  dataKey="nombre"
                  tick={{ fill: AXIS_TICK, fontSize: 11 }}
                  tickLine={false}
                  axisLine={{ stroke: GRID_STROKE }}
                  tickFormatter={(v: string) =>
                    v.length > 12 ? `${v.slice(0, 11)}…` : v
                  }
                  interval={0}
                />
                <YAxis
                  yAxisId="ha"
                  tick={{ fill: AXIS_TICK, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={44}
                />
                <YAxis
                  yAxisId="score"
                  orientation="right"
                  domain={[0, 100]}
                  tick={{ fill: AXIS_TICK, fontSize: 11 }}
                  tickLine={false}
                  axisLine={false}
                  width={32}
                />
                <Tooltip
                  content={<ChartTooltip />}
                  cursor={{ fill: "var(--gray-a3)" }}
                />
                <Bar
                  yAxisId="ha"
                  dataKey="hectareas"
                  name="Hectáreas"
                  fill={COLOR_HECTAREAS}
                  radius={[4, 4, 0, 0]}
                  maxBarSize={48}
                  animationDuration={650}
                  animationEasing="ease-out"
                />
                <Line
                  yAxisId="score"
                  type="monotone"
                  dataKey="score"
                  name="Score salud"
                  stroke={COLOR_SCORE}
                  strokeWidth={2.5}
                  dot={{ r: 3, fill: COLOR_SCORE, strokeWidth: 0 }}
                  activeDot={{ r: 5 }}
                  connectNulls
                  animationDuration={650}
                  animationEasing="ease-out"
                />
              </ComposedChart>
            )}
          </Box>
        )}

        {/* Leyenda compacta de las dos series. */}
        {data.length > 0 && (
          <Flex align="center" gap="4" justify="center" wrap="wrap">
            <LegendDot color={COLOR_HECTAREAS} label="Hectáreas totales" />
            <LegendDot color={COLOR_SCORE} label="Score salud promedio" />
          </Flex>
        )}
      </Flex>
    </Card>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <Flex align="center" gap="2">
      <Box
        style={{
          width: 10,
          height: 10,
          borderRadius: 3,
          backgroundColor: color,
          flexShrink: 0,
        }}
      />
      <Text size="1" className="text-slate-400" style={{ fontSize: SECONDARY_FONT }}>
        {label}
      </Text>
    </Flex>
  );
}

/** Skeleton del gráfico: cabecera real + barras placeholder. */
export function AnalisisEstablecimientoChartSkeleton() {
  return (
    <Card
      size="2"
      variant="surface"
      className="agro-surface h-full"
      style={CARD_PADDING}
    >
      <Flex direction="column" gap="3" className="h-full min-h-0">
        <ChartHeader />
        <Flex
          align="end"
          justify="between"
          gap="3"
          className="min-h-0 flex-1"
          style={{ paddingInline: 8, minHeight: MIN_CHART_HEIGHT }}
        >
          {[60, 85, 45, 70, 55].map((h, i) => (
            <Skeleton
              key={i}
              style={{ width: "100%", height: `${h}%`, borderRadius: "var(--radius-2)" }}
            />
          ))}
        </Flex>
      </Flex>
    </Card>
  );
}
