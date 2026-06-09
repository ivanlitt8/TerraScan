"use client";

import { loteDetallePath, ESTABLECIMIENTOS_PATH } from "@/lib/routes";
import {
  ApiServiceError,
  fetchEstablecimientoById,
  fetchLotes,
  setLoteEstablecimiento,
} from "@/services";
import type { LoteListItem } from "@/types/loteAnalysis";
import {
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Dialog,
  DropdownMenu,
  Flex,
  Grid,
  Heading,
  IconButton,
  ScrollArea,
  Skeleton,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  AlertTriangle,
  ArrowLeft,
  LandPlot,
  Loader2,
  MapPin,
  MoreVertical,
  Plus,
  Search,
  Unlink,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

type Phase = "loading" | "ready" | "error";

type Props = { establecimientoId: string };

export default function EstablecimientoDetalleView({ establecimientoId }: Props) {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [nombre, setNombre] = useState<string>("");
  const [lotes, setLotes] = useState<LoteListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isNotFound, setIsNotFound] = useState(false);

  // Mutaciones de asignación (spinner por fila + bloqueos).
  const [mutatingId, setMutatingId] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const handleAuthError = useCallback(
    (cause: unknown): boolean => {
      if (cause instanceof ApiServiceError && cause.status === 401) {
        router.replace("/?tab=login&error=Tu+sesión+expiró.");
        return true;
      }
      return false;
    },
    [router],
  );

  // `nonce` permite reintentar el fetch re-disparando el effect. El reset a
  // estado de carga se hace acá (event handler), no dentro del effect, para
  // no incurrir en setState síncrono dentro del effect (cascading renders).
  // En el montaje inicial el estado ya arranca en "loading".
  const [nonce, setNonce] = useState(0);
  const reload = useCallback(() => {
    setPhase("loading");
    setError(null);
    setIsNotFound(false);
    setNonce((n) => n + 1);
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    fetchEstablecimientoById(establecimientoId, { signal: controller.signal })
      .then((detalle) => {
        if (cancelled) return;
        setNombre(detalle.nombre);
        setLotes(detalle.lotes);
        setPhase("ready");
      })
      .catch((cause: unknown) => {
        if (cancelled || controller.signal.aborted) return;
        if (handleAuthError(cause)) return;
        setIsNotFound(cause instanceof ApiServiceError && cause.status === 404);
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudo cargar el establecimiento.",
        );
        setPhase("error");
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [establecimientoId, nonce, handleAuthError]);

  /** Asigna un lote a este establecimiento (lo agrega a la grilla). */
  const handleAssign = useCallback(
    async (lote: LoteListItem) => {
      setMutatingId(lote.id);
      setMutationError(null);
      try {
        await setLoteEstablecimiento(lote.id, establecimientoId);
        setLotes((prev) =>
          prev.some((l) => l.id === lote.id)
            ? prev
            : [{ ...lote, establecimientoId }, ...prev],
        );
      } catch (cause) {
        if (handleAuthError(cause)) return;
        setMutationError(
          cause instanceof Error ? cause.message : "No se pudo asignar el lote.",
        );
      } finally {
        setMutatingId(null);
      }
    },
    [establecimientoId, handleAuthError],
  );

  /** Quita un lote de este establecimiento (lo desagrupa). */
  const handleUnassign = useCallback(
    async (loteId: string) => {
      setMutatingId(loteId);
      setMutationError(null);
      try {
        await setLoteEstablecimiento(loteId, null);
        setLotes((prev) => prev.filter((l) => l.id !== loteId));
      } catch (cause) {
        if (handleAuthError(cause)) return;
        setMutationError(
          cause instanceof Error ? cause.message : "No se pudo quitar el lote.",
        );
      } finally {
        setMutatingId(null);
      }
    },
    [handleAuthError],
  );

  const totalHa = lotes.reduce((s, l) => s + l.areaHectareas, 0);

  return (
    <Flex
      direction="column"
      className="agro-panel h-full w-full overflow-hidden"
      px={{ initial: "4", md: "6" }}
      py={{ initial: "4", md: "6" }}
    >
      <Box
        className="h-full min-h-0 w-full"
        style={{ maxWidth: 1280, marginInline: "auto", display: "flex", flexDirection: "column" }}
      >
        {/* Cabecera */}
        <Box className="shrink-0">
          <Button
            type="button"
            variant="ghost"
            color="gray"
            size="2"
            onClick={() => router.push(ESTABLECIMIENTOS_PATH)}
          >
            <ArrowLeft size={16} aria-hidden />
            Establecimientos
          </Button>
          <Flex align="center" justify="between" gap="4" wrap="wrap" mt="2">
            {phase === "loading" ? (
              <Skeleton style={{ height: 36, width: 260 }} />
            ) : (
              <Box style={{ minWidth: 0 }}>
                <Heading size="7" weight="bold" truncate style={{ letterSpacing: "-0.02em" }}>
                  {nombre || "Establecimiento"}
                </Heading>
                {phase === "ready" && (
                  <Text as="p" size="2" className="text-slate-400" mt="1">
                    {lotes.length} {lotes.length === 1 ? "lote" : "lotes"} ·{" "}
                    {HECTAREAS_FMT.format(totalHa)} ha en total
                  </Text>
                )}
              </Box>
            )}

            {phase === "ready" && (
              <AsignarLotesDialog
                establecimientoId={establecimientoId}
                mutatingId={mutatingId}
                onAssign={handleAssign}
                onAuthError={handleAuthError}
              />
            )}
          </Flex>
        </Box>

        {/* Contenido */}
        <Box className="mt-5 min-h-0 flex-1 overflow-y-auto">
          {mutationError && (
            <Callout.Root color="red" size="1" variant="soft" mb="3">
              <Callout.Icon>
                <AlertTriangle size={16} aria-hidden />
              </Callout.Icon>
              <Callout.Text>{mutationError}</Callout.Text>
            </Callout.Root>
          )}

          {phase === "error" && (
            <Callout.Root color="red" variant="surface">
              <Callout.Icon>
                <AlertTriangle size={16} aria-hidden />
              </Callout.Icon>
              <Callout.Text>
                <Flex align="center" justify="between" gap="3" wrap="wrap">
                  <Text as="span">
                    {isNotFound
                      ? "No encontramos este establecimiento o no tenés permiso para verlo."
                      : error}
                  </Text>
                  {!isNotFound && (
                    <Button size="1" variant="soft" color="red" onClick={reload} type="button">
                      Reintentar
                    </Button>
                  )}
                </Flex>
              </Callout.Text>
            </Callout.Root>
          )}

          {phase === "loading" && (
            <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} style={{ height: 96, borderRadius: "var(--radius-4)" }} />
              ))}
            </Grid>
          )}

          {phase === "ready" && lotes.length === 0 && (
            <Flex direction="column" align="center" justify="center" gap="3" py="9">
              <Flex
                align="center"
                justify="center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "var(--radius-5)",
                  backgroundColor: "var(--sky-a3)",
                  color: "var(--sky-11)",
                }}
              >
                <LandPlot size={28} aria-hidden />
              </Flex>
              <Heading size="4" weight="medium">
                Este campo no tiene lotes
              </Heading>
              <Text size="2" className="text-slate-400" align="center" style={{ maxWidth: 360 }}>
                Asigná lotes existentes con el botón de arriba, o dibujá uno nuevo en el mapa.
              </Text>
              <Button variant="soft" color="jade" onClick={() => router.push("/mapa")}>
                <MapPin size={16} aria-hidden />
                Ir al mapa
              </Button>
            </Flex>
          )}

          {phase === "ready" && lotes.length > 0 && (
            <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="4">
              {lotes.map((lote) => {
                const busy = mutatingId === lote.id;
                return (
                  <Card
                    key={lote.id}
                    size="3"
                    variant="surface"
                    className="agro-surface"
                    style={{ cursor: "pointer", opacity: busy ? 0.6 : 1 }}
                    role="button"
                    tabIndex={0}
                    onClick={() =>
                      router.push(loteDetallePath(lote.id, establecimientoId))
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        router.push(loteDetallePath(lote.id, establecimientoId));
                      }
                    }}
                  >
                    <Flex align="center" justify="between" gap="2">
                      <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                        <Flex
                          align="center"
                          justify="center"
                          flexShrink="0"
                          style={{
                            width: 36,
                            height: 36,
                            borderRadius: "var(--radius-3)",
                            backgroundColor: "var(--grass-a3)",
                            color: "var(--grass-11)",
                          }}
                        >
                          <LandPlot size={18} aria-hidden />
                        </Flex>
                        <Box style={{ minWidth: 0 }}>
                          <Heading size="3" weight="medium" truncate>
                            {lote.nombre}
                          </Heading>
                          <Text size="1" className="text-slate-400">
                            {HECTAREAS_FMT.format(lote.areaHectareas)} ha
                          </Text>
                        </Box>
                      </Flex>

                      {busy ? (
                        <Loader2 size={16} className="animate-spin" aria-hidden style={{ color: "var(--gray-9)" }} />
                      ) : (
                        <DropdownMenu.Root>
                          <DropdownMenu.Trigger>
                            <IconButton
                              variant="ghost"
                              color="gray"
                              size="1"
                              aria-label={`Acciones para ${lote.nombre}`}
                              onClick={(e) => e.stopPropagation()}
                            >
                              <MoreVertical size={18} />
                            </IconButton>
                          </DropdownMenu.Trigger>
                          <DropdownMenu.Content
                            onClick={(e) => e.stopPropagation()}
                          >
                            <DropdownMenu.Item
                              onSelect={() =>
                                router.push(
                                  loteDetallePath(lote.id, establecimientoId),
                                )
                              }
                            >
                              Abrir ficha
                            </DropdownMenu.Item>
                            <DropdownMenu.Separator />
                            <DropdownMenu.Item
                              color="red"
                              onSelect={() => void handleUnassign(lote.id)}
                            >
                              <Unlink size={14} aria-hidden />
                              Quitar del campo
                            </DropdownMenu.Item>
                          </DropdownMenu.Content>
                        </DropdownMenu.Root>
                      )}
                    </Flex>
                  </Card>
                );
              })}
            </Grid>
          )}
        </Box>
      </Box>
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

type AsignarLotesDialogProps = {
  establecimientoId: string;
  mutatingId: string | null;
  onAssign: (lote: LoteListItem) => Promise<void>;
  onAuthError: (cause: unknown) => boolean;
};

/**
 * Diálogo que lista los lotes del usuario que **no** pertenecen a este
 * establecimiento (sin agrupar o en otro campo) y permite asignarlos.
 */
function AsignarLotesDialog({
  establecimientoId,
  mutatingId,
  onAssign,
  onAuthError,
}: AsignarLotesDialogProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [lotes, setLotes] = useState<LoteListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [assignedIds, setAssignedIds] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");

  const loadCandidatos = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all = await fetchLotes();
      setLotes(all.filter((l) => l.establecimientoId !== establecimientoId));
    } catch (cause) {
      if (onAuthError(cause)) return;
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar los lotes.",
      );
    } finally {
      setLoading(false);
    }
  }, [establecimientoId, onAuthError]);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) {
      setAssignedIds(new Set());
      setQuery("");
      void loadCandidatos();
    }
  };

  const handleClickAssign = async (lote: LoteListItem) => {
    await onAssign(lote);
    setAssignedIds((prev) => new Set(prev).add(lote.id));
  };

  const normalizedQuery = query.trim().toLowerCase();
  // Candidatos base: lotes que aún no asignamos en esta sesión del diálogo.
  const candidatos = lotes.filter((l) => !assignedIds.has(l.id));
  const hayCandidatos = candidatos.length > 0;
  // Lo que se muestra tras aplicar el buscador por nombre.
  const disponibles = candidatos.filter(
    (l) =>
      normalizedQuery === "" || l.nombre.toLowerCase().includes(normalizedQuery),
  );

  return (
    <Dialog.Root open={open} onOpenChange={handleOpenChange}>
      <Dialog.Trigger>
        <Button variant="solid" color="jade" size="2">
          <Plus size={16} aria-hidden />
          Asignar lotes
        </Button>
      </Dialog.Trigger>
      <Dialog.Content maxWidth="460px">
        <Dialog.Title>Asignar lotes al campo</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="3">
          Elegí qué lotes querés agrupar en este establecimiento.
        </Dialog.Description>

        {error && (
          <Callout.Root color="red" size="1" variant="soft" mb="3">
            <Callout.Icon>
              <AlertTriangle size={16} aria-hidden />
            </Callout.Icon>
            <Callout.Text>{error}</Callout.Text>
          </Callout.Root>
        )}

        {!loading && hayCandidatos && (
          <Box mb="3">
            <TextField.Root
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar lote por nombre…"
              size="2"
              aria-label="Buscar lote por nombre"
            >
              <TextField.Slot>
                <Search size={15} aria-hidden />
              </TextField.Slot>
            </TextField.Root>
          </Box>
        )}

        {loading ? (
          <Flex direction="column" gap="2">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} style={{ height: 52, borderRadius: "var(--radius-3)" }} />
            ))}
          </Flex>
        ) : disponibles.length === 0 ? (
          <Flex direction="column" align="center" gap="2" py="6">
            <Text size="2" weight="medium" highContrast>
              {hayCandidatos
                ? "Sin resultados"
                : "No hay lotes disponibles"}
            </Text>
            <Text size="1" className="text-slate-400" align="center">
              {hayCandidatos
                ? `Ningún lote coincide con “${query.trim()}”.`
                : "Todos tus lotes ya están en este campo o todavía no creaste ninguno."}
            </Text>
          </Flex>
        ) : (
          <ScrollArea type="hover" scrollbars="vertical" style={{ maxHeight: 320 }}>
            <Flex direction="column" gap="2" pr="2">
              {disponibles.map((lote) => {
                const busy = mutatingId === lote.id;
                const enOtroCampo =
                  lote.establecimientoId != null &&
                  lote.establecimientoId !== establecimientoId;
                return (
                  <Card key={lote.id} size="1" variant="surface">
                    <Flex align="center" justify="between" gap="3">
                      <Box style={{ minWidth: 0 }}>
                        <Flex align="center" gap="2">
                          <Text size="2" weight="medium" truncate>
                            {lote.nombre}
                          </Text>
                          {enOtroCampo && (
                            <Badge color="amber" variant="soft" radius="full" size="1">
                              En otro campo
                            </Badge>
                          )}
                        </Flex>
                        <Text size="1" className="text-slate-400">
                          {HECTAREAS_FMT.format(lote.areaHectareas)} ha
                        </Text>
                      </Box>
                      <Button
                        size="1"
                        variant="soft"
                        color="jade"
                        disabled={busy}
                        onClick={() => void handleClickAssign(lote)}
                      >
                        {busy ? (
                          <Loader2 size={14} className="animate-spin" aria-hidden />
                        ) : (
                          <Plus size={14} aria-hidden />
                        )}
                        {enOtroCampo ? "Mover aquí" : "Agregar"}
                      </Button>
                    </Flex>
                  </Card>
                );
              })}
            </Flex>
          </ScrollArea>
        )}

        <Flex gap="3" mt="4" justify="end">
          <Dialog.Close>
            <Button variant="soft" color="gray" type="button">
              Listo
            </Button>
          </Dialog.Close>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}
