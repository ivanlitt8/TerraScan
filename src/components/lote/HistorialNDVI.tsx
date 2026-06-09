"use client";

import NDVITimeSeriesChart from "@/components/NDVITimeSeriesChart";
import {
  NDVI_PERIODS,
  type NDVIPeriodId,
} from "@/hooks/useNDVISerie";
import type { NDVIStatPoint } from "@/services";
import { Box, Callout, Flex, Heading, SegmentedControl, Skeleton, Text } from "@radix-ui/themes";
import { AlertTriangle } from "lucide-react";

const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

type SerieStatus = "idle" | "loading" | "ready" | "error";

type HistorialNDVIProps = {
  serie: NDVIStatPoint[];
  status: SerieStatus;
  period: NDVIPeriodId;
  onPeriodChange: (period: NDVIPeriodId) => void;
};

export function HistorialNDVI({
  serie,
  status,
  period,
  onPeriodChange,
}: HistorialNDVIProps) {
  const rangoLabel =
    NDVI_PERIODS.find((p) => p.id === period)?.rangoLabel ?? "últimos 30 días";

  return (
    <Box>
      <Flex justify="between" align="center" gap="3">
        <Heading size="2" weight="medium" truncate style={{ minWidth: 0 }}>
          Evolución del vigor (NDVI)
        </Heading>
        <SegmentedControl.Root
          size="1"
          value={period}
          onValueChange={(value) => onPeriodChange(value as NDVIPeriodId)}
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
      <Text
        as="p"
        size="1"
        className="text-slate-400"
        mt="1"
        mb="3"
        style={{ fontSize: SECONDARY_FONT }}
      >
        Sentinel-2 L2A · {rangoLabel} · intervalos de 10 días
      </Text>

      {(status === "loading" || status === "idle") && (
        <Skeleton
          style={{ height: 172, width: "100%", borderRadius: "var(--radius-3)" }}
        />
      )}

      {status === "error" && (
        <Callout.Root color="red" size="1" variant="soft">
          <Callout.Icon>
            <AlertTriangle size={16} aria-hidden />
          </Callout.Icon>
          <Callout.Text>
            No se pudo cargar la evolución del NDVI para este período.
          </Callout.Text>
        </Callout.Root>
      )}

      {status === "ready" && <NDVITimeSeriesChart serie={serie} />}
    </Box>
  );
}
