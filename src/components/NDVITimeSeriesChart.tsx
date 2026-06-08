"use client";

/**
 * Gráfico de evolución NDVI **real** del lote a partir de los datos que
 * devuelve `GET /api/lotes/:id/salud-analisis` (Sentinel Hub Statistical
 * API agregada por intervalos `P10D`).
 *
 * Es el único gráfico NDVI del dashboard (ya no hay fallback histórico mock):
 *  - Eje X: fechas (intervalos de 10 días).
 *  - Origen: respuesta real de Sentinel, no mock.
 *  - Estado: derivado al vuelo por banda NDVI (sin clasificación humana).
 *  - Si la serie llega vacía (todo descartado por nubes), muestra un
 *    placeholder honesto en vez de ejes flotando.
 */

import type { NDVIStatPoint } from "@/services";
import { Box, Card, Flex, Text } from "@radix-ui/themes";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type NDVITimeSeriesChartProps = {
  serie: NDVIStatPoint[];
};

type ChartPoint = NDVIStatPoint & {
  /** Label corto del eje X (`dd MMM`). */
  label: string;
  /**
   * Banda agronómica derivada del NDVI puntual. Sirve para colorear el dot
   * y comunicar contexto sin tablas auxiliares.
   *
   *  - `< 0.2`  → suelo desnudo / estrés (rojo)
   *  - `< 0.4`  → vegetación pobre (amarillo)
   *  - `< 0.6`  → vegetación moderada (verde claro)
   *  - `≥ 0.6`  → vegetación vigorosa (verde oscuro)
   *
   * Mismos cortes que usa el evalscript del backend (`NDVI_PROCESS_EVALSCRIPT`)
   * para que la lectura visual del chart sea coherente con la del raster.
   */
  banda: "estres" | "pobre" | "moderada" | "vigorosa";
};

type TooltipPayload = {
  payload?: ChartPoint;
};

const BANDA_COLOR: Record<ChartPoint["banda"], string> = {
  estres: "var(--red-9)",
  pobre: "var(--amber-9)",
  moderada: "var(--jade-9)",
  vigorosa: "var(--green-10)",
};

const BANDA_LABEL: Record<ChartPoint["banda"], string> = {
  estres: "Estrés",
  pobre: "Vegetación pobre",
  moderada: "Vegetación moderada",
  vigorosa: "Vegetación vigorosa",
};

/**
 * Leyenda compacta (una sola fila) al pie del gráfico. Resumimos las 4 bandas
 * en 3 hitos legibles para no robar aire vertical; el detalle fino por punto
 * sigue disponible en el tooltip.
 */
const LEGEND_RANGOS: { banda: ChartPoint["banda"]; label: string }[] = [
  { banda: "estres", label: "Estrés" },
  { banda: "pobre", label: "Pobre" },
  { banda: "vigorosa", label: "Vigorosa" },
];

function classifyBanda(ndvi: number): ChartPoint["banda"] {
  if (ndvi < 0.2) return "estres";
  if (ndvi < 0.4) return "pobre";
  if (ndvi < 0.6) return "moderada";
  return "vigorosa";
}

/**
 * Convierte `YYYY-MM-DD` a un label corto en `es-AR`. Lo hacemos en el
 * cliente y no usamos `Intl.DateTimeFormat` con timezone porque Sentinel
 * trabaja en UTC y agrupar visualmente por día calendario UTC es lo más
 * consistente con la mosaicación que hace `/statistics`.
 */
function formatLabel(fecha: string): string {
  const [year, month, day] = fecha.split("-").map(Number);
  if (!year || !month || !day) return fecha;
  // Construimos la fecha como UTC explícito para evitar el shift de huso
  // local que mete `new Date("YYYY-MM-DD")` en algunos navegadores (Safari).
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
}

/**
 * Color del texto del healthScore en el tooltip, alineado con los cortes
 * agronómicos del backend (`healthCategoria` en `LoteService`):
 *  - `>= 70` → jade (sano).
 *  - `>= 40` → ámbar (moderado).
 *  - `<  40` → rojo (estrés mayoritario).
 *
 * Sincronizar con `getScoreTheme` (en `DashboardLote`) y con
 * `healthCategoria` (backend) si se ajustan los cortes.
 */
function healthScoreColor(score: number): string {
  if (score >= 70) return "var(--jade-11)";
  if (score >= 40) return "var(--amber-11)";
  return "var(--red-11)";
}

function NdviTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: TooltipPayload[];
}) {
  if (!active || !payload?.length) return null;

  const point = payload[0]?.payload;
  if (!point) return null;

  return (
    <Card size="1" variant="surface" style={{ padding: "var(--space-2)" }}>
      <Flex direction="column" gap="1">
        <Text size="2" weight="medium">
          {formatLabel(point.fecha)}
        </Text>
        <Text size="1" color="gray">
          NDVI:{" "}
          <Text as="span" size="1" color="jade" weight="medium">
            {point.ndvi.toFixed(2)}
          </Text>
        </Text>
        <Text size="1" color="gray">
          Salud:{" "}
          <Text
            as="span"
            size="1"
            weight="medium"
            style={{ color: healthScoreColor(point.healthScore) }}
          >
            {point.healthScore}/100
          </Text>
        </Text>
        <Text
          size="1"
          weight="medium"
          style={{ color: BANDA_COLOR[point.banda] }}
        >
          {BANDA_LABEL[point.banda]}
        </Text>
        <Text size="1" color="gray">
          {point.validPixels.toLocaleString("es-AR")} píxeles válidos
        </Text>
      </Flex>
    </Card>
  );
}

export default function NDVITimeSeriesChart({
  serie,
}: NDVITimeSeriesChartProps) {
  const data: ChartPoint[] = [...serie]
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .map((p) => ({
      ...p,
      label: formatLabel(p.fecha),
      banda: classifyBanda(p.ndvi),
    }));

  // Si por alguna razón el backend devolvió cero puntos (todas las escenas
  // descartadas por nubes, p.ej.), mostramos un placeholder honesto en vez
  // de un chart vacío con ejes flotando.
  if (data.length === 0) {
    return (
      <Card variant="ghost">
        <Text size="1" color="gray" align="center" as="p">
          No hay datos NDVI disponibles para el período seleccionado (posible
          cobertura nubosa total).
        </Text>
      </Card>
    );
  }

  return (
    <Box>
      <Box height="172px" width="100%">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 5, right: 10, left: -25, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--gray-a3)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--gray-11)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              minTickGap={24}
            />
            <YAxis
              domain={["dataMin - 0.05", "dataMax + 0.05"]}
              tickCount={4}
              tick={{ fill: "var(--gray-11)", fontSize: 11 }}
              axisLine={false}
              tickLine={false}
              tickFormatter={(v: number) => v.toFixed(2)}
            />
            <Tooltip content={<NdviTooltip />} />
            <Line
              type="monotone"
              dataKey="ndvi"
              stroke="var(--jade-9)"
              strokeWidth={2.5}
              dot={({ cx, cy, payload }) => {
                if (cx == null || cy == null || !payload) return <g />;
                const p = payload as ChartPoint;
                return (
                  <circle
                    key={p.fecha}
                    cx={cx}
                    cy={cy}
                    r={3.5}
                    fill={BANDA_COLOR[p.banda]}
                    strokeWidth={0}
                  />
                );
              }}
              activeDot={{
                r: 5,
                fill: "var(--jade-10)",
                stroke: "var(--gray-1)",
                strokeWidth: 2,
              }}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <Flex justify="between" align="center" pt="1" mt="2">
        <Text size="1" color="gray">
          Rangos:
        </Text>
        <Flex align="center" gap="3">
          {LEGEND_RANGOS.map(({ banda, label }) => (
            <Flex key={banda} align="center" gap="1">
              <Box
                width="8px"
                height="8px"
                style={{
                  borderRadius: "2px",
                  backgroundColor: BANDA_COLOR[banda],
                }}
              />
              <Text size="1" color="gray">
                {label}
              </Text>
            </Flex>
          ))}
        </Flex>
      </Flex>
    </Box>
  );
}
