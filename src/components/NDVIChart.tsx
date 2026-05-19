"use client";

import type { NdviCampania, NdviEstado } from "@/types/loteAnalysis";
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

type NDVIChartProps = {
  serie: NdviCampania[];
};

type ChartPoint = NdviCampania & {
  campania: string;
};

type TooltipPayload = {
  payload?: ChartPoint;
};

function estadoColor(estado: NdviEstado): string {
  return estado === "Sequía" ? "var(--amber-9)" : "var(--jade-9)";
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
          Campaña {point.anio}
        </Text>
        <Text size="1" color="gray">
          NDVI:{" "}
          <Text as="span" size="1" color="jade" weight="medium">
            {point.ndvi.toFixed(2)}
          </Text>
        </Text>
        <Text
          size="1"
          weight="medium"
          color={point.estado === "Sequía" ? "amber" : "jade"}
        >
          {point.estado}
        </Text>
      </Flex>
    </Card>
  );
}

export default function NDVIChart({ serie }: NDVIChartProps) {
  const data: ChartPoint[] = [...serie]
    .sort((a, b) => a.anio - b.anio)
    .map((c) => ({
      ...c,
      campania: String(c.anio),
    }));

  const ndviValues = data.map((d) => d.ndvi);
  const yMin = Math.max(0, Math.floor((Math.min(...ndviValues) - 0.08) * 10) / 10);
  const yMax = Math.min(1, Math.ceil((Math.max(...ndviValues) + 0.05) * 10) / 10);

  return (
    <Box>
      <Heading size="2" weight="medium">
        Evolución del vigor (NDVI)
      </Heading>
      <Text as="p" size="1" color="gray" mt="1">
        Promedio por campaña · últimos 8 años
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
              dataKey="campania"
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
                    key={p.anio}
                    cx={cx}
                    cy={cy}
                    r={5}
                    fill={estadoColor(p.estado)}
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

      <Flex gap="4" mt="3" wrap="wrap">
        <Flex align="center" gap="2">
          <Box
            width="8px"
            height="8px"
            style={{
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--jade-9)",
            }}
          />
          <Text size="1" color="gray">
            Normal
          </Text>
        </Flex>
        <Flex align="center" gap="2">
          <Box
            width="8px"
            height="8px"
            style={{
              borderRadius: "var(--radius-full)",
              backgroundColor: "var(--amber-9)",
            }}
          />
          <Text size="1" color="gray">
            Sequía
          </Text>
        </Flex>
      </Flex>
    </Box>
  );
}
