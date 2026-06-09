"use client";

import { useDashboard } from "@/hooks/useDashboard";
import { loteDetallePath } from "@/lib/routes";
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  Heading,
  ScrollArea,
  Text,
} from "@radix-ui/themes";
import { AlertTriangle, LayoutDashboard } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useSyncExternalStore } from "react";
import { KpiCards, KpiCardsSkeleton } from "./KpiCards";
import {
  MatrizRiesgoHidrico,
  MatrizRiesgoHidricoSkeleton,
} from "./MatrizRiesgoHidrico";
import {
  MonitorIncendios,
  MonitorIncendiosSkeleton,
} from "./MonitorIncendios";
import { SuperficieDonut, SuperficieDonutSkeleton } from "./SuperficieDonut";

const FECHA_LARGA_FMT = new Intl.DateTimeFormat("es-AR", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
});

// Fecha solo-cliente sin mismatch de hidratación: el server renderiza "" y el
// cliente la formatea tras montar. Evita `setState` dentro de un efecto.
const subscribeNoop = () => () => {};
const getFechaClient = () => FECHA_LARGA_FMT.format(new Date());
const getFechaServer = () => "";

export default function DashboardView() {
  const router = useRouter();
  const { phase, data, error, isAuthError, reload } = useDashboard();

  const fechaHoy = useSyncExternalStore(
    subscribeNoop,
    getFechaClient,
    getFechaServer,
  );

  // Sesión expirada → mandamos a login con el mismo patrón del workspace.
  useEffect(() => {
    if (phase === "error" && isAuthError) {
      const search = new URLSearchParams({
        tab: "login",
        error: "Tu sesión expiró. Iniciá sesión nuevamente.",
      });
      router.replace(`/?${search.toString()}`);
    }
  }, [phase, isAuthError, router]);

  // Ficha de detalle (matriz hídrica + dona del dashboard).
  const goToLoteDetalle = useCallback(
    (loteId: string) => {
      router.push(loteDetallePath(loteId));
    },
    [router],
  );

  // Mapa operativo (monitor de incendios del dashboard).
  const goToLoteOnMap = useCallback(
    (loteId: string) => {
      router.push(`/mapa?lote=${encodeURIComponent(loteId)}`);
    },
    [router],
  );

  const isEmpty =
    phase === "ready" && data !== null && data.kpis.totalLotes === 0;

  return (
    <Flex
      direction="column"
      className="agro-panel h-full w-full overflow-hidden"
      px={{ initial: "4", md: "5" }}
      py={{ initial: "4", md: "5" }}
    >
      <Box
        className="h-full min-h-0 w-full"
        style={{
          maxWidth: 1400,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* ── Cabecera (estática) ───────────────────────────────────────── */}
        <Flex direction="column" gap="1" className="shrink-0" mb="4">
          <Heading size="7" weight="bold" style={{ letterSpacing: "-0.02em" }}>
            Dashboard Gerencial
          </Heading>
          <Text size="2" className="text-slate-400 capitalize">
            {fechaHoy || "\u00A0"}
          </Text>
        </Flex>

        {phase === "error" && !isAuthError && (
          <Callout.Root color="red" variant="surface" mb="4" className="shrink-0">
            <Callout.Icon>
              <AlertTriangle size={16} aria-hidden />
            </Callout.Icon>
            <Callout.Text>
              <Flex align="center" justify="between" gap="3" wrap="wrap">
                <Text as="span">{error}</Text>
                <Button
                  size="1"
                  variant="soft"
                  color="red"
                  onClick={reload}
                  type="button"
                >
                  Reintentar
                </Button>
              </Flex>
            </Callout.Text>
          </Callout.Root>
        )}

        {/* ── KPIs (estáticos) ──────────────────────────────────────────── */}
        <Box className="shrink-0">
          {phase === "loading" && <KpiCardsSkeleton />}
          {phase === "ready" && data && <KpiCards kpis={data.kpis} />}
        </Box>

        {/* ── Área de trabajo (alto fijo, sin scroll de página) ─────────── */}
        {isEmpty ? (
          <EmptyState onGoToMap={() => router.push("/mapa")} />
        ) : (
          <Box className="mt-5 min-h-0 flex-1 overflow-hidden">
            <Grid
              columns={{ initial: "1", md: "12" }}
              rows={{ initial: "2", md: "1" }}
              gap="5"
              className="h-full"
            >
              {/* Izquierda: matriz hídrica con scroll interno */}
              <Box
                gridColumn={{ initial: "auto", md: "span 6" }}
                className="h-full min-h-0 min-w-0"
              >
                {phase === "loading" ? (
                  <MatrizRiesgoHidricoSkeleton />
                ) : (
                  data && (
                    <MatrizRiesgoHidrico
                      items={data.matrizRiesgoHidrico}
                      onSelectLote={goToLoteDetalle}
                    />
                  )
                )}
              </Box>

              {/* Derecha: monitor + dona. Scroll con ScrollArea de Radix
                  (mismo que usa la tabla), no scroll nativo. */}
              <Box
                gridColumn={{ initial: "auto", md: "span 6" }}
                className="h-full min-h-0 min-w-0"
              >
                <ScrollArea
                  scrollbars="vertical"
                  type="hover"
                  style={{ height: "100%" }}
                >
                  <Flex direction="column" gap="4" pr="3">
                    {phase === "loading" ? (
                      <>
                        <MonitorIncendiosSkeleton />
                        <SuperficieDonutSkeleton />
                      </>
                    ) : (
                      data && (
                        <>
                          <MonitorIncendios
                            items={data.monitorIncendios}
                            onSelectLote={goToLoteOnMap}
                          />
                          <SuperficieDonut
                            items={data.matrizRiesgoHidrico}
                            onSelectLote={goToLoteDetalle}
                          />
                        </>
                      )
                    )}
                  </Flex>
                </ScrollArea>
              </Box>
            </Grid>
          </Box>
        )}
      </Box>
    </Flex>
  );
}

function EmptyState({ onGoToMap }: { onGoToMap: () => void }) {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      gap="3"
      className="min-h-0 flex-1"
    >
      <Flex
        align="center"
        justify="center"
        style={{
          width: 56,
          height: 56,
          borderRadius: "var(--radius-4)",
          backgroundColor: "var(--jade-a3)",
          color: "var(--jade-11)",
        }}
      >
        <LayoutDashboard size={28} aria-hidden />
      </Flex>
      <Heading size="4">Todavía no tenés lotes</Heading>
      <Text size="2" className="text-slate-400" align="center">
        Creá tu primer lote desde el mapa para empezar a ver tus indicadores
        acá.
      </Text>
      <Button type="button" color="jade" onClick={onGoToMap}>
        Ir al Mapa Interactivo
      </Button>
    </Flex>
  );
}
