"use client";

import type { MonitorIncendioItem } from "@/services";
import {
  Badge,
  Box,
  Card,
  Flex,
  Heading,
  Skeleton,
  Text,
} from "@radix-ui/themes";
import { Flame, ShieldCheck } from "lucide-react";
import type { CSSProperties } from "react";

type MonitorIncendiosProps = {
  items: MonitorIncendioItem[];
  onSelectLote: (loteId: string) => void;
};

// Padding vertical del Card a la mitad del size 2 (space-4) para más densidad.
const CARD_PADDING: CSSProperties = { paddingBlock: "var(--space-2)" };
// Fuente secundaria un punto menor que `font-size-1` (respeta el scaling).
const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

const FECHA_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

/** `YYYY-MM-DD` → `dd mmm yyyy` en es-AR (UTC, sin shift de huso). */
function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return FECHA_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Normaliza la confianza VIIRS (`l`/`n`/`h`) o numérica a una etiqueta. */
function formatConfianza(confianza: string | null): {
  label: string;
  color: "red" | "amber" | "gray";
} {
  if (!confianza) return { label: "s/d", color: "gray" };
  const value = confianza.trim().toLowerCase();
  if (value === "h" || value === "high") return { label: "Alta", color: "red" };
  if (value === "n" || value === "nominal")
    return { label: "Media", color: "amber" };
  if (value === "l" || value === "low")
    return { label: "Baja", color: "gray" };
  // MODIS devuelve 0–100: lo mostramos como porcentaje.
  const numeric = Number(value);
  if (!Number.isNaN(numeric)) {
    return {
      label: `${numeric}%`,
      color: numeric >= 80 ? "red" : numeric >= 50 ? "amber" : "gray",
    };
  }
  return { label: confianza, color: "gray" };
}

/** Cabecera (icono + título + subtítulo). Reutilizada por el skeleton. */
function MonitorHeader() {
  return (
    <Box>
      <Flex align="center" gap="2">
        <Flame size={18} aria-hidden style={{ color: "var(--orange-11)" }} />
        <Heading size="4" weight="medium">
          Monitor de incendios
        </Heading>
      </Flex>
      <Text
        size="1"
        className="text-slate-400"
        style={{ fontSize: SECONDARY_FONT }}
      >
        Focos en tus lotes (últimos 30 días · NASA FIRMS).
      </Text>
    </Box>
  );
}

export function MonitorIncendios({
  items,
  onSelectLote,
}: MonitorIncendiosProps) {
  return (
    <Card size="2" variant="surface" className="agro-surface" style={CARD_PADDING}>
      <Flex direction="column" gap="3">
        <MonitorHeader />

        {items.length === 0 ? (
          <Flex
            direction="column"
            align="center"
            justify="center"
            gap="2"
            py="5"
          >
            <Flex
              align="center"
              justify="center"
              style={{
                width: 44,
                height: 44,
                borderRadius: "var(--radius-4)",
                backgroundColor: "var(--jade-a3)",
                color: "var(--jade-11)",
              }}
            >
              <ShieldCheck size={24} aria-hidden />
            </Flex>
            <Text size="2" weight="medium" highContrast>
              Sin focos detectados
            </Text>
            <Text size="1" className="text-slate-400" align="center">
              Ninguno de tus lotes registró incendios recientes.
            </Text>
          </Flex>
        ) : (
          <Flex direction="column" gap="2">
            {items.map((foco, idx) => {
                const conf = formatConfianza(foco.confianza);
                return (
                  <Card
                    key={`${foco.loteId}-${foco.fecha}-${idx}`}
                    size="1"
                    variant="surface"
                    className="cursor-pointer transition-colors hover:bg-(--gray-a3)"
                    onClick={() => onSelectLote(foco.loteId)}
                  >
                    <Flex align="center" gap="3">
                      <Flex
                        align="center"
                        justify="center"
                        flexShrink="0"
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: "var(--radius-3)",
                          backgroundColor: "var(--orange-a3)",
                          color: "var(--orange-11)",
                        }}
                      >
                        <Flame size={16} strokeWidth={2} aria-hidden />
                      </Flex>
                      <Flex
                        direction="column"
                        style={{ minWidth: 0, flex: 1 }}
                      >
                        <Text size="2" weight="medium" highContrast truncate>
                          {foco.nombreLote}
                        </Text>
                        <Text
                          size="1"
                          className="text-slate-400"
                          style={{ fontSize: SECONDARY_FONT }}
                        >
                          {formatFecha(foco.fecha)}
                          {foco.hora ? ` · ${foco.hora} UTC` : ""}
                        </Text>
                      </Flex>
                      <Badge
                        color={conf.color}
                        variant="soft"
                        radius="full"
                        style={{ flexShrink: 0 }}
                      >
                        {conf.label}
                      </Badge>
                    </Flex>
                  </Card>
                );
              })}
          </Flex>
        )}
      </Flex>
    </Card>
  );
}

/** Skeleton del monitor: cabecera real + 3 filas de foco placeholder. */
export function MonitorIncendiosSkeleton() {
  return (
    <Card size="2" variant="surface" className="agro-surface" style={CARD_PADDING}>
      <Flex direction="column" gap="3">
        <MonitorHeader />
        <Flex direction="column" gap="2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Card key={i} size="1" variant="surface">
              <Flex align="center" gap="3">
                <Skeleton
                  style={{ width: 32, height: 32, borderRadius: "var(--radius-3)" }}
                />
                <Flex direction="column" gap="1" style={{ flex: 1 }}>
                  <Skeleton style={{ height: 13, width: "55%" }} />
                  <Skeleton style={{ height: 11, width: "35%" }} />
                </Flex>
                <Skeleton style={{ height: 20, width: 52, borderRadius: "999px" }} />
              </Flex>
            </Card>
          ))}
        </Flex>
      </Flex>
    </Card>
  );
}
