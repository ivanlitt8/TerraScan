"use client";

import type { MatrizRiesgoHidricoItem } from "@/services";
import {
  Badge,
  Box,
  Card,
  Flex,
  Heading,
  Skeleton,
  Table,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Droplets, Search } from "lucide-react";
import type { CSSProperties } from "react";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

/**
 * Header pegajoso: con `Table.Root variant="ghost"` la tabla no crea su propio
 * contexto de overflow, así que el `sticky` se ancla al viewport del ScrollArea
 * interno de Radix → los encabezados quedan siempre visibles al hacer scroll.
 * El fondo opaco evita que las filas se transparenten por detrás.
 */
// Fuente secundaria un punto menor que `font-size-1` (respeta el scaling).
const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

// Padding vertical del Card a la mitad del size 3 (space-5) para más densidad.
const CARD_FLEX: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  paddingBlock: "var(--space-3)",
};

const STICKY_HEADER: CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 1,
  backgroundColor: "#0f172a",
  fontSize: SECONDARY_FONT,
};

type MatrizRiesgoHidricoProps = {
  items: MatrizRiesgoHidricoItem[];
  onSelectLote: (loteId: string) => void;
  /** Valor del buscador por nombre (controlado por el dashboard). */
  search?: string;
  onSearchChange?: (value: string) => void;
};

/** Cabecera (icono + título + subtítulo + buscador). Reutilizada por el skeleton. */
function MatrizHeader({
  search,
  onSearchChange,
}: {
  search?: string;
  onSearchChange?: (value: string) => void;
}) {
  return (
    <Box className="shrink-0">
      <Flex align="center" justify="between" gap="3" wrap="wrap">
        <Box style={{ minWidth: 0 }}>
          <Flex align="center" gap="2">
            <Droplets size={18} aria-hidden style={{ color: "var(--sky-11)" }} />
            <Heading size="4" weight="medium">
              Matriz de riesgo hídrico
            </Heading>
          </Flex>
          <Text size="1" className="text-slate-400">
            Elevación media e historial de inundaciones (Global Flood Database)
            por lote.
          </Text>
        </Box>

        {onSearchChange && (
          <TextField.Root
            size="2"
            placeholder="Buscar lote…"
            value={search ?? ""}
            onChange={(e) => onSearchChange(e.target.value)}
            style={{ width: 200, flexShrink: 0 }}
            aria-label="Buscar lote por nombre"
          >
            <TextField.Slot>
              <Search size={15} aria-hidden />
            </TextField.Slot>
          </TextField.Root>
        )}
      </Flex>
    </Box>
  );
}

/** Badge semántico según la cantidad de eventos de inundación cacheados. */
function RiesgoBadge({ eventos }: { eventos: number }) {
  if (eventos === 0) {
    return (
      <Badge color="green" variant="soft" radius="full">
        Sin riesgo
      </Badge>
    );
  }
  if (eventos === 1) {
    return (
      <Badge color="amber" variant="soft" radius="full">
        {eventos} evento
      </Badge>
    );
  }
  return (
    <Badge color="red" variant="soft" radius="full">
      {eventos} eventos
    </Badge>
  );
}

export function MatrizRiesgoHidrico({
  items,
  onSelectLote,
  search,
  onSearchChange,
}: MatrizRiesgoHidricoProps) {
  return (
    <Card
      size="3"
      variant="surface"
      className="agro-surface h-full"
      style={CARD_FLEX}
    >
      <Flex direction="column" gap="3" className="min-h-0 flex-1">
        <MatrizHeader search={search} onSearchChange={onSearchChange} />

        {items.length === 0 ? (
          <Box py="6">
            <Text size="2" className="text-slate-400" align="center" as="div">
              {search && search.trim().length > 0
                ? "Ningún lote coincide con la búsqueda."
                : "Todavía no hay lotes para analizar."}
            </Text>
          </Box>
        ) : (
          <Box className="flex-1 min-h-0">
            <Table.Root variant="ghost" size="1" style={{ height: "100%" }}>
              <Table.Header>
                <Table.Row>
                  <Table.ColumnHeaderCell style={STICKY_HEADER}>
                    Lote
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={STICKY_HEADER}>
                    Superficie
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={STICKY_HEADER}>
                    Elevación
                  </Table.ColumnHeaderCell>
                  <Table.ColumnHeaderCell style={STICKY_HEADER}>
                    Inundaciones
                  </Table.ColumnHeaderCell>
                </Table.Row>
              </Table.Header>
              <Table.Body>
                {items.map((lote) => (
                  <Table.Row
                    key={lote.id}
                    onClick={() => onSelectLote(lote.id)}
                    className="cursor-pointer transition-colors hover:bg-(--gray-a3)"
                  >
                    <Table.RowHeaderCell>
                      <Text weight="medium" highContrast truncate>
                        {lote.nombre}
                      </Text>
                    </Table.RowHeaderCell>
                    <Table.Cell style={{ fontSize: SECONDARY_FONT }}>
                      {HECTAREAS_FMT.format(lote.areaHectareas)} ha
                    </Table.Cell>
                    <Table.Cell style={{ fontSize: SECONDARY_FONT }}>
                      {lote.elevacionMedia !== null
                        ? `${HECTAREAS_FMT.format(lote.elevacionMedia)} m s.n.m.`
                        : "—"}
                    </Table.Cell>
                    <Table.Cell>
                      <RiesgoBadge eventos={lote.totalEventosInundacion} />
                    </Table.Cell>
                  </Table.Row>
                ))}
              </Table.Body>
            </Table.Root>
          </Box>
        )}
      </Flex>
    </Card>
  );
}

/**
 * Skeleton de la matriz: misma carcasa (Card a alto completo + cabecera real)
 * con filas de placeholder que imitan las 4 columnas de la tabla.
 */
export function MatrizRiesgoHidricoSkeleton() {
  return (
    <Card
      size="3"
      variant="surface"
      className="agro-surface h-full"
      style={CARD_FLEX}
    >
      <Flex direction="column" gap="3" className="min-h-0 flex-1">
        <MatrizHeader />
        <Box className="flex-1 min-h-0 overflow-hidden">
          <Flex direction="column">
            {Array.from({ length: 9 }).map((_, i) => (
              <Flex
                key={i}
                align="center"
                justify="between"
                gap="3"
                py="2"
                style={{ borderBottom: "1px solid var(--gray-a3)" }}
              >
                <Skeleton style={{ height: 14, width: "30%" }} />
                <Skeleton style={{ height: 14, width: "16%" }} />
                <Skeleton style={{ height: 14, width: "20%" }} />
                <Skeleton
                  style={{ height: 20, width: 78, borderRadius: "999px" }}
                />
              </Flex>
            ))}
          </Flex>
        </Box>
      </Flex>
    </Card>
  );
}
