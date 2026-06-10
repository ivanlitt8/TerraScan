"use client";

import { useDashboardData } from "@/hooks/useDashboardData";
import { loteDetallePath } from "@/lib/routes";
import type { DashboardKpis, MatrizRiesgoHidricoItem } from "@/services";
import {
  Box,
  Button,
  Callout,
  Flex,
  Grid,
  Heading,
  Select,
  Text,
} from "@radix-ui/themes";
import { AlertTriangle, LayoutDashboard } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import {
  AnalisisEstablecimientoChart,
  AnalisisEstablecimientoChartSkeleton,
} from "./AnalisisEstablecimientoChart";
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

/** Valores especiales del selector global de establecimiento. */
const FILTRO_TODOS = "all";
const FILTRO_SIN_CAMPO = "none";

export default function DashboardView() {
  const router = useRouter();
  const { phase, data, establecimientos, error, isAuthError, reload } =
    useDashboardData();

  // ── Filtros globales (cabecera) + búsqueda (tabla) ─────────────────────
  const [selectedEstablecimientoId, setSelectedEstablecimientoId] =
    useState<string>(FILTRO_TODOS);
  const [search, setSearch] = useState("");

  const fechaHoy = useSyncExternalStore(
    subscribeNoop,
    getFechaClient,
    getFechaServer,
  );

  // Sesión expirada → mandamos a login con el mismo patrón del workspace.
  useEffect(() => {
    if (phase === "error" && isAuthError) {
      const params = new URLSearchParams({
        tab: "login",
        error: "Tu sesión expiró. Iniciá sesión nuevamente.",
      });
      router.replace(`/?${params.toString()}`);
    }
  }, [phase, isAuthError, router]);

  const goToLoteDetalle = useCallback(
    (loteId: string) => router.push(loteDetallePath(loteId)),
    [router],
  );
  const goToLoteOnMap = useCallback(
    (loteId: string) => router.push(`/mapa?lote=${encodeURIComponent(loteId)}`),
    [router],
  );

  // ── Predicado de pertenencia al establecimiento seleccionado ───────────
  const matchesEstablecimiento = useCallback(
    (establecimientoId: string | null): boolean => {
      if (selectedEstablecimientoId === FILTRO_TODOS) return true;
      if (selectedEstablecimientoId === FILTRO_SIN_CAMPO)
        return establecimientoId === null;
      return establecimientoId === selectedEstablecimientoId;
    },
    [selectedEstablecimientoId],
  );

  // ── Datasets derivados (todo client-side, recalculado por filtro) ──────
  const matriz = useMemo(() => data?.matrizRiesgoHidrico ?? [], [data]);
  const monitor = useMemo(() => data?.monitorIncendios ?? [], [data]);

  // ¿Hay lotes sin agrupar? (para ofrecer "Sin campo" en el selector).
  const haySinCampo = useMemo(
    () => matriz.some((l) => l.establecimientoId === null),
    [matriz],
  );

  /** Lotes filtrados por el establecimiento global (afecta a todo el dashboard). */
  const matrizFiltrada = useMemo<MatrizRiesgoHidricoItem[]>(
    () => matriz.filter((l) => matchesEstablecimiento(l.establecimientoId)),
    [matriz, matchesEstablecimiento],
  );

  // Mapa loteId → establecimientoId para filtrar el monitor de incendios.
  const loteToEstab = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const l of matriz) map.set(l.id, l.establecimientoId);
    return map;
  }, [matriz]);

  const monitorFiltrado = useMemo(
    () =>
      monitor.filter((m) =>
        matchesEstablecimiento(loteToEstab.get(m.loteId) ?? null),
      ),
    [monitor, matchesEstablecimiento, loteToEstab],
  );

  /** Tabla: filtro global + búsqueda por nombre (case-insensitive, parcial). */
  const matrizTabla = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return matrizFiltrada;
    return matrizFiltrada.filter((l) => l.nombre.toLowerCase().includes(q));
  }, [matrizFiltrada, search]);

  /** KPIs recalculados sobre el subconjunto filtrado. */
  const kpis = useMemo<DashboardKpis>(() => {
    const totalHectareas = Number(
      matrizFiltrada.reduce((sum, l) => sum + l.areaHectareas, 0).toFixed(1),
    );
    const lotesConRiesgoHidrico = matrizFiltrada.filter(
      (l) => l.totalEventosInundacion >= 1,
    ).length;
    const lotesConIncendiosRecientes = new Set(
      monitorFiltrado.map((m) => m.loteId),
    ).size;
    return {
      totalLotes: matrizFiltrada.length,
      totalHectareas,
      lotesConRiesgoHidrico,
      lotesConIncendiosRecientes,
    };
  }, [matrizFiltrada, monitorFiltrado]);

  // Usuario sin ningún lote (no es un caso de filtro): empty state global.
  const isEmpty = phase === "ready" && matriz.length === 0;

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
        {/* ── Cabecera + selector global ────────────────────────────────── */}
        <Flex
          align="center"
          justify="between"
          gap="4"
          wrap="wrap"
          className="shrink-0"
          mb="4"
        >
          <Flex direction="column" gap="1" style={{ minWidth: 0 }}>
            <Heading size="7" weight="bold" style={{ letterSpacing: "-0.02em" }}>
              Dashboard Gerencial
            </Heading>
            <Text size="2" className="text-slate-400 capitalize">
              {fechaHoy || "\u00A0"}
            </Text>
          </Flex>

          {!isEmpty && (
            <Box style={{ minWidth: 240 }}>
              <Select.Root
                value={selectedEstablecimientoId}
                onValueChange={setSelectedEstablecimientoId}
                size="2"
                disabled={phase !== "ready"}
              >
                <Select.Trigger
                  variant="surface"
                  color="jade"
                  placeholder="Establecimiento"
                  style={{ width: "100%" }}
                />
                <Select.Content position="popper">
                  <Select.Item value={FILTRO_TODOS}>
                    Todos los establecimientos
                  </Select.Item>
                  {(establecimientos.length > 0 || haySinCampo) && (
                    <Select.Separator />
                  )}
                  {establecimientos.map((est) => (
                    <Select.Item key={est.id} value={est.id}>
                      {est.nombre}
                    </Select.Item>
                  ))}
                  {haySinCampo && (
                    <Select.Item value={FILTRO_SIN_CAMPO}>
                      Sin establecimiento
                    </Select.Item>
                  )}
                </Select.Content>
              </Select.Root>
            </Box>
          )}
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

        {/* ── KPIs (dinámicos según filtro) ─────────────────────────────── */}
        <Box className="shrink-0">
          {phase === "loading" && <KpiCardsSkeleton />}
          {phase === "ready" && data && <KpiCards kpis={kpis} />}
        </Box>

        {/* ── Área de trabajo ───────────────────────────────────────────── */}
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
              {/* Izquierda: matriz hídrica (con búsqueda) */}
              <Box
                gridColumn={{ initial: "auto", md: "span 6" }}
                className="h-full min-h-0 min-w-0"
              >
                {phase === "loading" ? (
                  <MatrizRiesgoHidricoSkeleton />
                ) : (
                  data && (
                    <MatrizRiesgoHidrico
                      items={matrizTabla}
                      onSelectLote={goToLoteDetalle}
                      search={search}
                      onSearchChange={setSearch}
                    />
                  )
                )}
              </Box>

              {/* Derecha: fila superior (monitor + dona) + análisis abajo */}
              <Box
                gridColumn={{ initial: "auto", md: "span 6" }}
                className="h-full min-h-0 min-w-0"
              >
                <Flex direction="column" gap="4" className="h-full min-h-0">
                  {phase === "loading" ? (
                    <>
                      <Grid
                        columns={{ initial: "1", sm: "2" }}
                        gap="4"
                        className="shrink-0"
                      >
                        <MonitorIncendiosSkeleton />
                        <SuperficieDonutSkeleton />
                      </Grid>
                      <Box className="min-h-0 flex-1">
                        <AnalisisEstablecimientoChartSkeleton />
                      </Box>
                    </>
                  ) : (
                    data && (
                      <>
                        <Grid
                          columns={{ initial: "1", sm: "2" }}
                          gap="4"
                          className="shrink-0"
                        >
                          <MonitorIncendios
                            items={monitorFiltrado}
                            onSelectLote={goToLoteOnMap}
                          />
                          <SuperficieDonut
                            items={matrizFiltrada}
                            onSelectLote={goToLoteDetalle}
                          />
                        </Grid>
                        <Box className="min-h-0 flex-1">
                          <AnalisisEstablecimientoChart items={matrizFiltrada} />
                        </Box>
                      </>
                    )
                  )}
                </Flex>
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
