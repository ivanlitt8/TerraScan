"use client";

/**
 * Gráfico de evolución NDVI **real** del lote a partir de los datos que
 * devuelve `GET /api/lotes/:id/salud-analisis` (Sentinel Hub Statistical
 * API agregada por intervalos `P10D`).
 *
 * No reemplaza al `NDVIChart` histórico (por campañas anuales) — convive
 * con él: el `DashboardLote` muestra este chart cuando hay stats reales
 * disponibles (NDVI cargado), y vuelve al histórico cuando no las hay.
 *
 * Comparación con `NDVIChart`:
 *  - Eje X: fechas (intervalos de 10 días) en vez de años de campaña.
 *  - Origen: respuesta real de Sentinel, no mock.
 *  - Estado: derivado al vuelo por banda NDVI (sin clasificación humana).
 */

import type { NDVIStatPoint } from "@/services";
import { Box, Card, Flex, Heading, Text } from "@radix-ui/themes";
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
  /** Rango temporal informativo (e.g. "últimos 30 días"). */
  rangoLabel?: string;
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
  rangoLabel = "últimos 30 días",
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
      <Box>
        <Heading size="2" weight="medium">
          Evolución del vigor (NDVI)
        </Heading>
        <Text as="p" size="1" color="gray" mt="1">
          Sentinel-2 · {rangoLabel}
        </Text>
        <Card mt="3" variant="ghost">
          <Text size="1" color="gray" align="center" as="p">
            No hay datos NDVI disponibles para el período seleccionado
            (posible cobertura nubosa total).
          </Text>
        </Card>
      </Box>
    );
  }

  const ndviValues = data.map((d) => d.ndvi);
  // Eje Y siempre incluye 0 como referencia agronómica (debajo de 0 ya es
  // agua/nieve). Tope dinámico para aprovechar el espacio cuando los valores
  // son bajos.
  const yMin = Math.min(0, Math.floor(Math.min(...ndviValues) * 10) / 10);
  const yMax = Math.min(1, Math.ceil((Math.max(...ndviValues) + 0.05) * 10) / 10);

  return (
    <Box>
      <Heading size="2" weight="medium">
        Evolución del vigor (NDVI)
      </Heading>
      <Text as="p" size="1" color="gray" mt="1">
        Sentinel-2 L2A · {rangoLabel} · intervalos de 10 días
      </Text>

      <Box mt="4" height="208px" width="100%">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={data}
            margin={{ top: 8, right: 8, left: -8, bottom: 0 }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              stroke="var(--gray-a6)"
              vertical={false}
            />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--gray-11)", fontSize: 11 }}
              axisLine={{ stroke: "var(--gray-a8)" }}
              tickLine={{ stroke: "var(--gray-a8)" }}
            />
            <YAxis
              domain={[yMin, yMax]}
              tick={{ fill: "var(--gray-11)", fontSize: 11 }}
              axisLine={{ stroke: "var(--gray-a8)" }}
              tickLine={{ stroke: "var(--gray-a8)" }}
              tickFormatter={(v: number) => v.toFixed(1)}
              width={32}
            />
            <Tooltip content={<NdviTooltip />} />
            <Line
              type="monotone"
              dataKey="ndvi"
              stroke="var(--jade-9)"
              strokeWidth={2.5}
              dot={({ cx, cy, payload }) => {
                if (cx == null || cy == null || !payload) return null;
                const p = payload as ChartPoint;
                return (
                  <circle
                    key={p.fecha}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={BANDA_COLOR[p.banda]}
                    stroke="var(--gray-1)"
                    strokeWidth={2}
                  />
                );
              }}
              activeDot={{
                r: 7,
                fill: "var(--jade-8)",
                stroke: "var(--gray-1)",
                strokeWidth: 2,
              }}
              animationDuration={800}
              animationEasing="ease-out"
            />
          </LineChart>
        </ResponsiveContainer>
      </Box>

      <Flex gap="3" mt="3" wrap="wrap">
        {(Object.keys(BANDA_LABEL) as ChartPoint["banda"][]).map((banda) => (
          <Flex key={banda} align="center" gap="2">
            <Box
              width="8px"
              height="8px"
              style={{
                borderRadius: "var(--radius-full)",
                backgroundColor: BANDA_COLOR[banda],
              }}
            />
            <Text size="1" color="gray">
              {BANDA_LABEL[banda]}
            </Text>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
