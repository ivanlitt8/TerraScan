"use client";

import NDVIChart from "@/components/NDVIChart";
import type { AlertaHistorica, LoteAnalysisResult } from "@/types/loteAnalysis";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Card,
  Flex,
  Heading,
  IconButton,
  Progress,
  Separator,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { Flame, RotateCcw, Waves, X } from "lucide-react";
import { useState } from "react";

type DashboardLoteProps = {
  data: LoteAnalysisResult;
  onClear: () => void;
};

type ScoreTheme = {
  color: "jade" | "amber" | "red";
  label: string;
};

function getScoreTheme(score: number): ScoreTheme {
  if (score >= 70) return { color: "jade", label: "Salud alta" };
  if (score >= 40) return { color: "amber", label: "Salud media" };
  return { color: "red", label: "Salud baja" };
}

function yearFromFecha(fecha: string): number {
  return new Date(fecha).getFullYear();
}

function groupYearsByTipo(
  alertas: AlertaHistorica[],
  tipo: AlertaHistorica["tipo"],
) {
  const years = alertas
    .filter((a) => a.tipo === tipo)
    .map((a) => yearFromFecha(a.fecha))
    .sort((a, b) => a - b);

  return [...new Set(years)];
}

function formatHectareas(ha: number): string {
  return ha.toLocaleString("es-AR", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 1,
  });
}

function AlertaItem({ alerta }: { alerta: AlertaHistorica }) {
  const isFire = alerta.tipo === "incendio";
  const year = yearFromFecha(alerta.fecha);

  return (
    <Card size="1" variant="surface">
      <Flex gap="3" align="start">
        <Flex
          align="center"
          justify="center"
          width="40px"
          height="40px"
          flexShrink="0"
          style={{
            borderRadius: "var(--radius-full)",
            backgroundColor: isFire
              ? "var(--orange-a3)"
              : "var(--sky-a3)",
            color: isFire ? "var(--orange-11)" : "var(--sky-11)",
          }}
        >
          {isFire ? (
            <Flame size={20} strokeWidth={1.75} aria-hidden />
          ) : (
            <Waves size={20} strokeWidth={1.75} aria-hidden />
          )}
        </Flex>
        <Flex direction="column" gap="1" style={{ minWidth: 0, flex: 1 }}>
          <Flex align="center" gap="2" wrap="wrap">
            <Text size="2" weight="medium">
              {isFire ? "Incendio" : "Inundación"}
            </Text>
            <Badge color={isFire ? "orange" : "sky"} variant="soft" radius="full">
              {year}
            </Badge>
            <Text size="1" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {isFire ? "NASA FIRMS" : "Sentinel-1 SAR"}
            </Text>
          </Flex>
          <Text size="1" color="gray">
            {alerta.descripcion}
          </Text>
        </Flex>
      </Flex>
    </Card>
  );
}

export default function DashboardLote({ data, onClear }: DashboardLoteProps) {
  const [confirmClearOpen, setConfirmClearOpen] = useState(false);
  const scoreTheme = getScoreTheme(data.scoreSalud);
  const incendioYears = groupYearsByTipo(data.alertas, "incendio");
  const inundacionYears = groupYearsByTipo(data.alertas, "inundacion");

  const handleConfirmClear = () => {
    onClear();
    setConfirmClearOpen(false);
  };

  return (
    <Flex
      asChild
      direction="column"
      height="100%"
      width="100%"
      style={{ minHeight: 0, background: "var(--gray-1)" }}
    >
      <aside aria-label="Panel de historial del lote">
        <Box px="5" py="4" flexShrink="0">
          <Flex align="center" justify="between" gap="3">
            <Box style={{ minWidth: 0 }}>
              <Heading size="4" weight="medium">
                Historial del lote
              </Heading>
              <Text as="p" size="2" color="gray" mt="1">
                {formatHectareas(data.hectareas)} ha · Región Pampeana
              </Text>
            </Box>

            <Flex align="center" gap="1" flexShrink="0">
              <Tooltip content="Restablecer búsqueda">
                <IconButton
                  type="button"
                  variant="soft"
                  color="gray"
                  size="2"
                  radius="medium"
                  aria-label="Restablecer búsqueda"
                  onClick={() => setConfirmClearOpen(true)}
                >
                  <RotateCcw size={16} aria-hidden />
                </IconButton>
              </Tooltip>
              <Tooltip content="Cerrar historial">
                <IconButton
                  type="button"
                  variant="soft"
                  color="gray"
                  size="2"
                  radius="medium"
                  aria-label="Cerrar panel y limpiar lote"
                  onClick={() => setConfirmClearOpen(true)}
                >
                  <X size={16} aria-hidden />
                </IconButton>
              </Tooltip>
            </Flex>
          </Flex>

          <AlertDialog.Root open={confirmClearOpen} onOpenChange={setConfirmClearOpen}>
            <AlertDialog.Content maxWidth="420px">
              <AlertDialog.Title>¿Restablecer búsqueda?</AlertDialog.Title>
              <AlertDialog.Description size="2">
                Se cerrará el historial de este lote y volverás al mapa para buscar o
                dibujar otro campo. Esta acción no se puede deshacer.
              </AlertDialog.Description>
              <Flex gap="3" mt="4" justify="end">
                <AlertDialog.Cancel>
                  <Button variant="soft" color="gray">
                    Cancelar
                  </Button>
                </AlertDialog.Cancel>
                <AlertDialog.Action>
                  <Button variant="solid" color="jade" onClick={handleConfirmClear}>
                    Sí, restablecer
                  </Button>
                </AlertDialog.Action>
              </Flex>
            </AlertDialog.Content>
          </AlertDialog.Root>
        </Box>

        <Separator size="4" />

        <Box px="5" py="4" flexShrink="0">
          <Card size="2" variant="surface">
            <Flex direction="column" gap="3">
              <Text size="1" weight="medium" color="gray" style={{ textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Score de salud histórica
              </Text>
              <Flex align="end" gap="2">
                <Heading size="8" color={scoreTheme.color} style={{ lineHeight: 1 }}>
                  {data.scoreSalud}
                </Heading>
                <Text size="4" color="gray" mb="1">
                  /100
                </Text>
              </Flex>
              <Text size="2" weight="medium" color={scoreTheme.color}>
                {scoreTheme.label}
              </Text>
              <Progress value={data.scoreSalud} color={scoreTheme.color} size="2" />
            </Flex>
          </Card>
        </Box>

        <Separator size="4" />

        <Box
          px="5"
          py="5"
          flexGrow="1"
          style={{ minHeight: 0, overflowY: "auto" }}
          className="scrollbar-none"
        >
          <Flex direction="column" gap="6">
            <NDVIChart serie={data.ndviSerie} />

            <Flex direction="column" gap="3">
              <Box>
                <Heading size="2" weight="medium">
                  Alertas críticas
                </Heading>
                <Text as="p" size="1" color="gray" mt="1">
                  Eventos históricos detectados en el lote
                </Text>
              </Box>

              {(incendioYears.length > 0 || inundacionYears.length > 0) && (
                <Flex gap="2" wrap="wrap">
                  {incendioYears.length > 0 && (
                    <Badge color="orange" variant="soft" radius="full" size="2">
                      <Flex align="center" gap="1" as="span">
                        <Flame size={14} strokeWidth={1.75} aria-hidden />
                        Incendios: {incendioYears.join(", ")}
                      </Flex>
                    </Badge>
                  )}
                  {inundacionYears.length > 0 && (
                    <Badge color="sky" variant="soft" radius="full" size="2">
                      <Flex align="center" gap="1" as="span">
                        <Waves size={14} strokeWidth={1.75} aria-hidden />
                        Inundaciones: {inundacionYears.join(", ")}
                      </Flex>
                    </Badge>
                  )}
                </Flex>
              )}

              <Flex direction="column" gap="2" asChild>
                <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
                  {data.alertas.map((alerta) => (
                    <li key={`${alerta.tipo}-${alerta.fecha}`}>
                      <AlertaItem alerta={alerta} />
                    </li>
                  ))}
                </ul>
              </Flex>

              {data.alertas.length === 0 && (
                <Card variant="ghost">
                  <Text size="1" color="gray" align="center">
                    No se registraron alertas críticas en el período analizado.
                  </Text>
                </Card>
              )}
            </Flex>
          </Flex>
        </Box>
      </aside>
    </Flex>
  );
}
