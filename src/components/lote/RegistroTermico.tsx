"use client";

import { confianzaLabel, type IncendioEvento } from "@/lib/incendiosClustering";
import { Badge, Card, Flex, Text } from "@radix-ui/themes";
import { Flame, ShieldCheck } from "lucide-react";

const SECONDARY_FONT = "calc(var(--font-size-1) - 1px)";

const FECHA_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatFecha(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  if (!y || !m || !d) return fecha;
  return FECHA_FMT.format(new Date(Date.UTC(y, m - 1, d)));
}

/** Color del badge según la confianza máxima del evento clusterizado. */
function confianzaColor(
  confianza: IncendioEvento["confianzaMax"],
): "red" | "amber" | "gray" {
  if (confianza === "h") return "red";
  if (confianza === "n") return "amber";
  return "gray";
}

type RegistroTermicoProps = {
  /** Eventos FIRMS ya clusterizados (más recientes primero). */
  eventos: IncendioEvento[];
};

export function RegistroTermico({ eventos }: RegistroTermicoProps) {
  if (eventos.length === 0) {
    return (
      <Flex direction="column" align="center" gap="2" py="6">
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
          Sin focos registrados
        </Text>
        <Text size="1" className="text-slate-400" align="center">
          NASA FIRMS no detectó actividad térmica histórica en este lote.
        </Text>
      </Flex>
    );
  }

  return (
    <Flex direction="column" gap="2">
      {eventos.map((evento) => {
        const confianza = confianzaLabel(evento.confianzaMax);
        const detalleParts: string[] = [];
        detalleParts.push(
          evento.satelites.length > 1
            ? evento.satelites.join(" + ")
            : evento.satelites[0],
        );
        if (confianza) detalleParts.push(`confianza ${confianza}`);
        if (evento.detecciones.length > 1) {
          detalleParts.push(`${evento.detecciones.length} detecciones`);
        }

        return (
          <Card key={evento.id} size="1" variant="surface">
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
              <Flex direction="column" style={{ minWidth: 0, flex: 1 }}>
                <Flex align="center" gap="2" wrap="wrap">
                  <Text size="2" weight="medium" highContrast>
                    Incendio · {formatFecha(evento.fecha)}
                  </Text>
                  {evento.frpMax != null && (
                    <Text
                      size="1"
                      style={{ color: "var(--orange-11)", fontWeight: 600 }}
                    >
                      FRP máx {evento.frpMax.toFixed(1)} MW
                    </Text>
                  )}
                </Flex>
                <Text
                  size="1"
                  className="text-slate-400"
                  style={{ fontSize: SECONDARY_FONT }}
                >
                  {detalleParts.join(" · ")}
                </Text>
              </Flex>
              {confianza && (
                <Badge
                  color={confianzaColor(evento.confianzaMax)}
                  variant="soft"
                  radius="full"
                  style={{ flexShrink: 0, textTransform: "capitalize" }}
                >
                  {confianza}
                </Badge>
              )}
            </Flex>
          </Card>
        );
      })}
    </Flex>
  );
}
