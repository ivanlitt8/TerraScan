"use client";

import type { FloodEvent } from "@/services";
import { Badge, Box, Flex, Text } from "@radix-ui/themes";
import { Droplets } from "lucide-react";

const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

const FECHA_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatFecha(iso: string | null): string {
  if (!iso) return "—";
  const [y, m, d] = iso.split("-").map(Number);
  if (!y || !m || !d) return iso;
  return FECHA_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

type HistorialHidricoProps = {
  eventos: FloodEvent[];
};

export function HistorialHidrico({ eventos }: HistorialHidricoProps) {
  const sorted = [...eventos].sort((a, b) => {
    const da = a.began ?? a.ended ?? "";
    const db = b.began ?? b.ended ?? "";
    return db.localeCompare(da);
  });

  if (sorted.length === 0) {
    return (
      <Flex direction="column" align="center" gap="2" py="6">
        <Droplets size={28} aria-hidden style={{ color: "var(--sky-a9)" }} />
        <Text size="2" weight="medium" highContrast>
          Sin eventos de inundación
        </Text>
        <Text size="1" className="text-slate-400" align="center">
          No hay registros en la base Global Flood Database para este lote.
        </Text>
      </Flex>
    );
  }

  return (
    <Box className="relative pl-5">
      {/* Línea vertical de la timeline */}
      <Box
        style={{
          position: "absolute",
          left: 7,
          top: 8,
          bottom: 8,
          width: 2,
          backgroundColor: "var(--sky-a5)",
          borderRadius: 1,
        }}
      />

      <Flex direction="column" gap="4">
        {sorted.map((ev, idx) => (
          <Flex key={`${ev.dfoId ?? idx}-${ev.began ?? idx}`} gap="3" align="start">
            <Flex
              align="center"
              justify="center"
              flexShrink="0"
              style={{
                width: 16,
                height: 16,
                marginLeft: -21,
                borderRadius: "50%",
                backgroundColor: "var(--sky-9)",
                border: "2px solid var(--color-panel-solid)",
                zIndex: 1,
              }}
            >
              <Box
                style={{
                  width: 4,
                  height: 4,
                  borderRadius: "50%",
                  backgroundColor: "white",
                }}
              />
            </Flex>

            <Flex direction="column" gap="1" style={{ flex: 1, minWidth: 0 }}>
              <Flex align="center" gap="2" wrap="wrap">
                <Text size="2" weight="medium" highContrast>
                  Inundación
                </Text>
                {ev.duracionDias !== null && (
                  <Badge color="sky" variant="soft" radius="full">
                    {ev.duracionDias} días de agua
                  </Badge>
                )}
              </Flex>
              <Text size="1" className="text-slate-400" style={{ fontSize: SECONDARY_FONT }}>
                {formatFecha(ev.began)}
                {ev.ended ? ` → ${formatFecha(ev.ended)}` : ""}
              </Text>
              {ev.dfoId !== null && (
                <Text size="1" color="gray" style={{ fontSize: SECONDARY_FONT }}>
                  DFO #{ev.dfoId} · Global Flood Database
                </Text>
              )}
            </Flex>
          </Flex>
        ))}
      </Flex>
    </Box>
  );
}
