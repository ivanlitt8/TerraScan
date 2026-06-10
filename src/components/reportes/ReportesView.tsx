"use client";

import {
  ApiServiceError,
  deleteReporte,
  fetchReportes,
  getReporteDownloadUrl,
  type ReporteListItem,
} from "@/services";
import {
  AlertDialog,
  Badge,
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Heading,
  IconButton,
  Skeleton,
  Table,
  Text,
  Tooltip,
} from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  Loader2,
  Trash2,
  X,
  XCircle,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

type Phase = "loading" | "ready" | "error";

const FECHA_FMT = new Intl.DateTimeFormat("es-AR", {
  day: "2-digit",
  month: "short",
  year: "numeric",
});

/** "09 jun 2026" → "09 Jun 2026" (capitaliza el mes abreviado). */
function formatFecha(iso: string): string {
  const partes = FECHA_FMT.formatToParts(new Date(iso));
  return partes
    .map((p) =>
      p.type === "month"
        ? p.value.charAt(0).toUpperCase() + p.value.slice(1).replace(".", "")
        : p.value,
    )
    .join("");
}

const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "reporte";

export default function ReportesView() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("loading");
  const [items, setItems] = useState<ReporteListItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Descarga en curso (por id) para feedback en el botón.
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  // Eliminación: reporte pendiente de confirmar + estado del request.
  const [pendingDelete, setPendingDelete] = useState<ReporteListItem | null>(
    null,
  );
  const [deleting, setDeleting] = useState(false);

  // Toast efímero.
  const [toast, setToast] = useState<ToastState | null>(null);
  const showToast = useCallback((kind: ToastState["kind"], message: string) => {
    setToast({ kind, message, id: Date.now() });
  }, []);

  const handleAuthExpired = useCallback(() => {
    router.replace("/?tab=login&error=Tu+sesión+expiró.");
  }, [router]);

  const load = useCallback(
    async (signal?: AbortSignal) => {
      setPhase("loading");
      setError(null);
      try {
        const data = await fetchReportes({ signal });
        if (signal?.aborted) return;
        setItems(data);
        setPhase("ready");
      } catch (cause) {
        if (signal?.aborted) return;
        if (cause instanceof ApiServiceError && cause.status === 401) {
          handleAuthExpired();
          return;
        }
        setError(
          cause instanceof Error
            ? cause.message
            : "No se pudieron cargar los reportes.",
        );
        setPhase("error");
      }
    },
    [handleAuthExpired],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const handleDownload = useCallback(
    async (reporte: ReporteListItem) => {
      setDownloadingId(reporte.id);
      try {
        const { url } = await getReporteDownloadUrl(reporte.id);
        const fileName = `${slugify(reporte.nombre)}.pdf`;
        // `download` fuerza `Content-Disposition: attachment` en el signed URL
        // de Supabase (descarga directa en vez de previsualizar en el browser).
        const downloadUrl = `${url}${url.includes("?") ? "&" : "?"}download=${encodeURIComponent(fileName)}`;

        const anchor = document.createElement("a");
        anchor.href = downloadUrl;
        anchor.rel = "noopener";
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
      } catch (cause) {
        if (cause instanceof ApiServiceError && cause.status === 401) {
          handleAuthExpired();
          return;
        }
        showToast(
          "error",
          cause instanceof Error
            ? cause.message
            : "No se pudo descargar el reporte.",
        );
      } finally {
        setDownloadingId(null);
      }
    },
    [handleAuthExpired, showToast],
  );

  const handleConfirmDelete = useCallback(async () => {
    if (!pendingDelete) return;
    const target = pendingDelete;

    setDeleting(true);
    // Optimista: lo sacamos de la lista en el acto.
    setItems((prev) => prev.filter((r) => r.id !== target.id));
    try {
      await deleteReporte(target.id);
      setPendingDelete(null);
      showToast("success", "Reporte eliminado de tu historial.");
    } catch (cause) {
      // Rollback si falló.
      setItems((prev) =>
        [...prev, target].sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        ),
      );
      if (cause instanceof ApiServiceError && cause.status === 401) {
        handleAuthExpired();
        return;
      }
      showToast(
        "error",
        cause instanceof Error
          ? cause.message
          : "No se pudo eliminar el reporte.",
      );
    } finally {
      setDeleting(false);
    }
  }, [pendingDelete, handleAuthExpired, showToast]);

  return (
    <Flex
      direction="column"
      className="agro-panel h-full w-full overflow-hidden"
      px={{ initial: "4", md: "6" }}
      py={{ initial: "4", md: "6" }}
    >
      <Box
        className="h-full min-h-0 w-full"
        style={{
          maxWidth: 1280,
          marginInline: "auto",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {/* Cabecera */}
        <Flex
          align="center"
          justify="between"
          gap="4"
          wrap="wrap"
          className="shrink-0"
        >
          <Box style={{ minWidth: 0 }}>
            <Heading size="7" weight="bold" style={{ letterSpacing: "-0.02em" }}>
              Reportes
            </Heading>
            <Text as="p" size="2" className="text-slate-400" mt="1">
              Tu historial de informes analíticos exportados, listos para
              descargar.
            </Text>
          </Box>
          {phase === "ready" && items.length > 0 && (
            <Badge color="jade" variant="soft" radius="full" size="2">
              {items.length} {items.length === 1 ? "reporte" : "reportes"}
            </Badge>
          )}
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
                  <Button
                    size="1"
                    variant="soft"
                    color="red"
                    onClick={() => void load()}
                    type="button"
                  >
                    Reintentar
                  </Button>
                </Flex>
              </Callout.Text>
            </Callout.Root>
          )}

          {phase === "loading" && <ReportesTableSkeleton />}

          {phase === "ready" && items.length === 0 && <ReportesEmptyState />}

          {phase === "ready" && items.length > 0 && (
            <Card size="2" variant="surface" className="agro-surface">
              <Table.Root variant="ghost" size="2">
                <Table.Header>
                  <Table.Row>
                    <Table.ColumnHeaderCell>
                      Nombre del reporte
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>Campo madre</Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell>
                      Fecha de generación
                    </Table.ColumnHeaderCell>
                    <Table.ColumnHeaderCell justify="end">
                      Acciones
                    </Table.ColumnHeaderCell>
                  </Table.Row>
                </Table.Header>

                <Table.Body>
                  {items.map((reporte) => (
                    <Table.Row key={reporte.id} align="center">
                      <Table.RowHeaderCell>
                        <Flex align="center" gap="2" style={{ minWidth: 0 }}>
                          <Flex
                            align="center"
                            justify="center"
                            flexShrink="0"
                            style={{
                              width: 30,
                              height: 30,
                              borderRadius: "var(--radius-2)",
                              backgroundColor: "var(--jade-a3)",
                              color: "var(--jade-11)",
                            }}
                          >
                            <FileText size={15} aria-hidden />
                          </Flex>
                          <Text size="2" weight="medium" highContrast truncate>
                            {reporte.nombre}
                          </Text>
                        </Flex>
                      </Table.RowHeaderCell>

                      <Table.Cell>
                        {reporte.establecimiento ? (
                          <Text size="2" className="text-slate-300">
                            {reporte.establecimiento}
                          </Text>
                        ) : (
                          <Text size="2" color="gray">
                            —
                          </Text>
                        )}
                      </Table.Cell>

                      <Table.Cell>
                        <Text size="2" className="text-slate-300">
                          {formatFecha(reporte.createdAt)}
                        </Text>
                      </Table.Cell>

                      <Table.Cell justify="end">
                        <Flex align="center" gap="2" justify="end">
                          <Button
                            type="button"
                            variant="soft"
                            color="jade"
                            size="1"
                            disabled={downloadingId === reporte.id}
                            onClick={() => void handleDownload(reporte)}
                          >
                            {downloadingId === reporte.id ? (
                              <Loader2
                                size={14}
                                className="animate-spin"
                                aria-hidden
                              />
                            ) : (
                              <Download size={14} aria-hidden />
                            )}
                            Descargar
                          </Button>
                          <Tooltip content="Eliminar reporte">
                            <IconButton
                              type="button"
                              variant="ghost"
                              color="red"
                              size="1"
                              aria-label={`Eliminar ${reporte.nombre}`}
                              onClick={() => setPendingDelete(reporte)}
                            >
                              <Trash2 size={15} aria-hidden />
                            </IconButton>
                          </Tooltip>
                        </Flex>
                      </Table.Cell>
                    </Table.Row>
                  ))}
                </Table.Body>
              </Table.Root>
            </Card>
          )}
        </Box>
      </Box>

      {/* Diálogo de confirmación de borrado (soft delete) */}
      <AlertDialog.Root
        open={pendingDelete !== null}
        onOpenChange={(open) => {
          if (deleting) return;
          if (!open) setPendingDelete(null);
        }}
      >
        <AlertDialog.Content maxWidth="460px">
          <AlertDialog.Title>¿Eliminar este reporte?</AlertDialog.Title>
          <AlertDialog.Description size="2">
            ¿Estás seguro de que deseas eliminar este reporte? Ya no estará
            disponible en tu panel, pero se mantendrá la validez de los reportes
            físicos guardados por 30 días.
          </AlertDialog.Description>

          <Flex gap="3" mt="4" justify="end">
            <AlertDialog.Cancel>
              <Button variant="soft" color="gray" disabled={deleting}>
                Cancelar
              </Button>
            </AlertDialog.Cancel>
            <Button
              variant="solid"
              color="red"
              onClick={() => void handleConfirmDelete()}
              disabled={deleting}
            >
              {deleting ? (
                <>
                  <Loader2 size={16} className="animate-spin" aria-hidden />
                  Eliminando…
                </>
              ) : (
                "Eliminar reporte"
              )}
            </Button>
          </Flex>
        </AlertDialog.Content>
      </AlertDialog.Root>

      <ToastNotification toast={toast} onDismiss={() => setToast(null)} />
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function ReportesTableSkeleton() {
  return (
    <Card size="2" variant="surface" className="agro-surface">
      <Flex direction="column" gap="2">
        <Skeleton style={{ height: 28, width: "100%", borderRadius: "var(--radius-2)" }} />
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton
            key={i}
            style={{ height: 48, width: "100%", borderRadius: "var(--radius-2)" }}
          />
        ))}
      </Flex>
    </Card>
  );
}

function ReportesEmptyState() {
  return (
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
        <FileText size={28} aria-hidden />
      </Flex>
      <Heading size="4" weight="medium">
        No has generado reportes todavía
      </Heading>
      <Text
        size="2"
        className="text-slate-400"
        align="center"
        style={{ maxWidth: 380 }}
      >
        Ve a la ficha de un lote para exportar tu primer informe analítico. Tus
        reportes quedarán archivados acá para descargarlos cuando los necesites.
      </Text>
    </Flex>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

type ToastState = {
  kind: "success" | "error";
  message: string;
  id: number;
};

function ToastNotification({
  toast,
  onDismiss,
}: {
  toast: ToastState | null;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(onDismiss, 3500);
    return () => window.clearTimeout(timer);
  }, [toast, onDismiss]);

  const isSuccess = toast?.kind === "success";

  return (
    <AnimatePresence>
      {toast && (
        <motion.div
          key={toast.id}
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 8, scale: 0.98 }}
          transition={{ duration: 0.22, ease: "easeOut" }}
          style={{
            position: "fixed",
            bottom: 24,
            right: 24,
            zIndex: 1000,
            maxWidth: 380,
          }}
          role="status"
          aria-live="polite"
        >
          <Card
            size="2"
            className="agro-glass"
            style={{
              borderLeft: `3px solid ${
                isSuccess ? "var(--jade-9)" : "var(--red-9)"
              }`,
            }}
          >
            <Flex align="center" gap="3">
              {isSuccess ? (
                <CheckCircle2
                  size={18}
                  aria-hidden
                  style={{ color: "var(--jade-11)", flexShrink: 0 }}
                />
              ) : (
                <XCircle
                  size={18}
                  aria-hidden
                  style={{ color: "var(--red-11)", flexShrink: 0 }}
                />
              )}
              <Text size="2" weight="medium" style={{ minWidth: 0 }}>
                {toast.message}
              </Text>
              <IconButton
                type="button"
                variant="ghost"
                color="gray"
                size="1"
                aria-label="Cerrar notificación"
                onClick={onDismiss}
                style={{ flexShrink: 0, marginLeft: "auto" }}
              >
                <X size={14} aria-hidden />
              </IconButton>
            </Flex>
          </Card>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
