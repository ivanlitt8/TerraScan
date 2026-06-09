"use client";

import {
  createEstablecimiento,
  fetchEstablecimientos,
  ApiServiceError,
  type EstablecimientoListItem,
} from "@/services";
import { establecimientoDetallePath } from "@/lib/routes";
import {
  Box,
  Button,
  Callout,
  Card,
  Dialog,
  Flex,
  Grid,
  Heading,
  IconButton,
  Skeleton,
  Text,
  TextField,
} from "@radix-ui/themes";
import {
  AlertTriangle,
  ChevronRight,
  LandPlot,
  Loader2,
  Plus,
  Sprout,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState, type FormEvent } from "react";

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

type Phase = "loading" | "ready" | "error";

export default function EstablecimientosView() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<EstablecimientoListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Diálogo de creación.
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nombre, setNombre] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setPhase("loading");
    setError(null);
    try {
      const data = await fetchEstablecimientos({ signal });
      if (signal?.aborted) return;
      setItems(data);
      setPhase("ready");
    } catch (cause) {
      if (signal?.aborted) return;
      if (cause instanceof ApiServiceError && cause.status === 401) {
        router.replace("/?tab=login&error=Tu+sesión+expiró.");
        return;
      }
      setError(
        cause instanceof Error
          ? cause.message
          : "No se pudieron cargar los establecimientos.",
      );
      setPhase("error");
    }
  }, [router]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleCreate = async (event: FormEvent) => {
    event.preventDefault();
    const value = nombre.trim();
    if (!value) {
      setCreateError("Ingresá un nombre para el establecimiento.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const created = await createEstablecimiento(value);
      setItems((prev) => [created, ...prev]);
      setNombre("");
      setDialogOpen(false);
    } catch (cause) {
      setCreateError(
        cause instanceof Error
          ? cause.message
          : "No se pudo crear el establecimiento.",
      );
    } finally {
      setCreating(false);
    }
  };

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
        <Flex align="center" justify="between" gap="4" wrap="wrap" className="shrink-0">
          <Box style={{ minWidth: 0 }}>
            <Heading size="7" weight="bold" style={{ letterSpacing: "-0.02em" }}>
              Establecimientos
            </Heading>
            <Text as="p" size="2" className="text-slate-400" mt="1">
              Agrupá tus lotes por campo para gestionarlos en conjunto.
            </Text>
          </Box>
          <Dialog.Root open={dialogOpen} onOpenChange={setDialogOpen}>
            <Dialog.Trigger>
              <Button variant="solid" color="jade" size="2">
                <Plus size={16} aria-hidden />
                Nuevo establecimiento
              </Button>
            </Dialog.Trigger>
            <Dialog.Content maxWidth="420px">
              <Dialog.Title>Nuevo establecimiento</Dialog.Title>
              <Dialog.Description size="2" color="gray" mb="3">
                Dale un nombre al campo. Después podrás asignarle lotes.
              </Dialog.Description>
              <form onSubmit={handleCreate}>
                <TextField.Root
                  value={nombre}
                  onChange={(e) => setNombre(e.target.value)}
                  placeholder="Ej: Estancia La Esperanza"
                  size="3"
                  autoFocus
                  disabled={creating}
                  maxLength={120}
                  aria-label="Nombre del establecimiento"
                />
                {createError && (
                  <Text size="1" color="red" mt="2" as="p">
                    {createError}
                  </Text>
                )}
                <Flex gap="3" mt="4" justify="end">
                  <Dialog.Close>
                    <Button variant="soft" color="gray" type="button" disabled={creating}>
                      Cancelar
                    </Button>
                  </Dialog.Close>
                  <Button type="submit" color="jade" disabled={creating || !nombre.trim()}>
                    {creating ? (
                      <>
                        <Loader2 size={16} className="animate-spin" aria-hidden />
                        Creando…
                      </>
                    ) : (
                      "Crear"
                    )}
                  </Button>
                </Flex>
              </form>
            </Dialog.Content>
          </Dialog.Root>
        </Flex>

        {/* Contenido */}
        <Box className="mt-5 min-h-0 flex-1 overflow-y-auto">
          {phase === "error" && (
            <Callout.Root color="red" variant="surface">
              <Callout.Icon>
                <AlertTriangle size={16} aria-hidden />
              </Callout.Icon>
              <Callout.Text>
                <Flex align="center" justify="between" gap="3" wrap="wrap">
                  <Text as="span">{error}</Text>
                  <Button size="1" variant="soft" color="red" onClick={() => void load()} type="button">
                    Reintentar
                  </Button>
                </Flex>
              </Callout.Text>
            </Callout.Root>
          )}

          {phase === "loading" && (
            <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} style={{ height: 132, borderRadius: "var(--radius-4)" }} />
              ))}
            </Grid>
          )}

          {phase === "ready" && items.length === 0 && (
            <Flex direction="column" align="center" justify="center" gap="3" py="9">
              <Flex
                align="center"
                justify="center"
                style={{
                  width: 56,
                  height: 56,
                  borderRadius: "var(--radius-5)",
                  backgroundColor: "var(--jade-a3)",
                  color: "var(--jade-11)",
                }}
              >
                <Sprout size={28} aria-hidden />
              </Flex>
              <Heading size="4" weight="medium">
                Todavía no tenés establecimientos
              </Heading>
              <Text size="2" className="text-slate-400" align="center" style={{ maxWidth: 360 }}>
                Creá tu primer campo para empezar a agrupar y comparar tus lotes.
              </Text>
              <Button variant="solid" color="jade" onClick={() => setDialogOpen(true)}>
                <Plus size={16} aria-hidden />
                Nuevo establecimiento
              </Button>
            </Flex>
          )}

          {phase === "ready" && items.length > 0 && (
            <Grid columns={{ initial: "1", sm: "2", lg: "3" }} gap="4">
              {items.map((est) => (
                <EstablecimientoCard
                  key={est.id}
                  item={est}
                  onOpen={() => router.push(establecimientoDetallePath(est.id))}
                />
              ))}
            </Grid>
          )}
        </Box>
      </Box>
    </Flex>
  );
}

function EstablecimientoCard({
  item,
  onOpen,
}: {
  item: EstablecimientoListItem;
  onOpen: () => void;
}) {
  return (
    <Card
      size="3"
      variant="surface"
      className="agro-surface transition-colors"
      style={{ cursor: "pointer" }}
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
    >
      <Flex direction="column" gap="3" style={{ height: "100%" }}>
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
                backgroundColor: "var(--jade-a3)",
                color: "var(--jade-11)",
              }}
            >
              <Sprout size={18} aria-hidden />
            </Flex>
            <Heading size="4" weight="medium" truncate>
              {item.nombre}
            </Heading>
          </Flex>
          <IconButton variant="ghost" color="gray" size="1" aria-hidden tabIndex={-1}>
            <ChevronRight size={18} />
          </IconButton>
        </Flex>

        <Flex align="center" gap="4" mt="1">
          <Flex align="center" gap="2">
            <LandPlot size={15} aria-hidden style={{ color: "var(--grass-a10)" }} />
            <Text size="2" weight="medium">
              {item.totalLotes} {item.totalLotes === 1 ? "lote" : "lotes"}
            </Text>
          </Flex>
          <Text size="2" className="text-slate-400">
            {HECTAREAS_FMT.format(item.totalHectareas)} ha
          </Text>
        </Flex>
      </Flex>
    </Card>
  );
}
