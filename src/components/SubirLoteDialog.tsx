"use client";

import { parsePolygonGeoJSON } from "@/lib/geojson";
import { Box, Button, Callout, Dialog, Flex, Text } from "@radix-ui/themes";
import { AnimatePresence, motion } from "framer-motion";
import type { Feature, Polygon } from "geojson";
import {
  AlertTriangle,
  CheckCircle2,
  CloudUpload,
  FileJson,
  Loader2,
} from "lucide-react";
import {
  useCallback,
  useId,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";

/** Tamaño máximo permitido del archivo GeoJSON (5 MB). */
const MAX_SIZE_BYTES = 5 * 1024 * 1024;

const HECTAREAS_FMT = new Intl.NumberFormat("es-AR", {
  maximumFractionDigits: 1,
});

type Status = "idle" | "processing" | "success";

type SubirLoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Se dispara con un `Feature<Polygon>` validado. El padre debe inyectarlo
   * en el mapa, encuadrar la cámara y cerrar el diálogo.
   */
  onLoteUploaded: (feature: Feature<Polygon>) => void;
};

/**
 * Diálogo de carga de lotes vía GeoJSON. Todo el procesamiento ocurre en el
 * navegador (FileReader + JSON.parse) — sin peticiones al backend. Valida que
 * el archivo contenga un único polígono y normaliza la geometría a
 * `Feature<Polygon>` para reutilizar el mismo flujo de "Confirmar lote" que el
 * dibujo manual y la detección con IA.
 */
export default function SubirLoteDialog({
  open,
  onOpenChange,
  onLoteUploaded,
}: SubirLoteDialogProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [areaCargada, setAreaCargada] = useState<number | null>(null);

  const resetEstado = useCallback(() => {
    setStatus("idle");
    setError(null);
    setIsDragging(false);
    setAreaCargada(null);
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const procesarArchivo = useCallback(
    (file: File) => {
      setError(null);

      const nombre = file.name.toLowerCase();
      const extensionValida =
        nombre.endsWith(".geojson") || nombre.endsWith(".json");
      const tipoValido =
        file.type === "application/geo+json" ||
        file.type === "application/json" ||
        file.type === "";

      if (!extensionValida || !tipoValido) {
        setStatus("idle");
        setError("Archivo inválido. Debe ser un archivo .geojson.");
        return;
      }

      if (file.size > MAX_SIZE_BYTES) {
        setStatus("idle");
        setError("El archivo supera el tamaño máximo de 5 MB.");
        return;
      }

      setStatus("processing");

      const reader = new FileReader();

      reader.onerror = () => {
        setStatus("idle");
        setError("No se pudo leer el archivo. Intentá nuevamente.");
      };

      reader.onload = () => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(String(reader.result));
        } catch {
          setStatus("idle");
          setError("Archivo inválido: el contenido no es un JSON válido.");
          return;
        }

        const result = parsePolygonGeoJSON(parsed);
        if (!result.ok) {
          setStatus("idle");
          setError(result.error);
          return;
        }

        setAreaCargada(result.hectareas);
        setStatus("success");
        // Breve pausa para que el usuario perciba el check de éxito antes de
        // que el modal se cierre y la cámara haga el fitBounds.
        window.setTimeout(() => {
          onLoteUploaded(result.feature);
        }, 550);
      };

      reader.readAsText(file);
    },
    [onLoteUploaded],
  );

  const handleInputChange = useCallback(
    (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) procesarArchivo(file);
    },
    [procesarArchivo],
  );

  const handleDrop = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      if (status === "processing" || status === "success") return;
      const file = event.dataTransfer.files?.[0];
      if (file) procesarArchivo(file);
    },
    [procesarArchivo, status],
  );

  const handleDragOver = useCallback(
    (event: DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      if (status === "idle") setIsDragging(true);
    },
    [status],
  );

  const handleDragLeave = useCallback((event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);
  }, []);

  const abrirSelector = useCallback(() => {
    if (status === "processing" || status === "success") return;
    inputRef.current?.click();
  }, [status]);

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        abrirSelector();
      }
    },
    [abrirSelector],
  );

  const procesando = status === "processing";
  const exito = status === "success";

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (procesando) return; // no cerrar a mitad de la lectura
        if (!next) resetEstado();
        onOpenChange(next);
      }}
    >
      <Dialog.Content maxWidth="480px">
        <Dialog.Title>Subir lote (GeoJSON)</Dialog.Title>
        <Dialog.Description size="2" color="gray" mb="4">
          Importá un archivo de lote único para cargarlo directamente en el
          mapa. El procesamiento es 100% en tu navegador.
        </Dialog.Description>

        <input
          ref={inputRef}
          id={inputId}
          type="file"
          accept=".geojson,application/geo+json,application/json"
          onChange={handleInputChange}
          style={{ display: "none" }}
          aria-hidden
          tabIndex={-1}
        />

        <Box
          role="button"
          tabIndex={procesando || exito ? -1 : 0}
          aria-label="Arrastrá o seleccioná tu archivo .geojson"
          aria-disabled={procesando || exito}
          onClick={abrirSelector}
          onKeyDown={handleKeyDown}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          style={{
            cursor: procesando || exito ? "default" : "pointer",
            borderRadius: "var(--radius-4)",
            border: `2px dashed ${
              exito
                ? "var(--jade-8)"
                : isDragging
                  ? "var(--jade-9)"
                  : "var(--gray-a7)"
            }`,
            background: isDragging
              ? "color-mix(in srgb, var(--jade-9) 10%, transparent)"
              : "var(--color-panel-translucent)",
            padding: "var(--space-6) var(--space-5)",
            transition:
              "border-color 160ms ease, background-color 160ms ease, transform 160ms ease",
            transform: isDragging ? "scale(1.01)" : "scale(1)",
            outline: "none",
          }}
        >
          <Flex direction="column" align="center" gap="3">
            <DropzoneIcon status={status} isDragging={isDragging} />

            {procesando ? (
              <Text size="2" weight="medium" align="center">
                Procesando geometría…
              </Text>
            ) : exito ? (
              <Flex direction="column" align="center" gap="1">
                <Text size="2" weight="medium" align="center">
                  Geometría válida. Cargando en el mapa…
                </Text>
                {areaCargada !== null && (
                  <Text size="1" color="gray" align="center">
                    Superficie detectada: {HECTAREAS_FMT.format(areaCargada)} ha
                  </Text>
                )}
              </Flex>
            ) : (
              <Flex direction="column" align="center" gap="1">
                <Text size="2" weight="medium" align="center">
                  Arrastrá tu archivo{" "}
                  <Text color="jade" weight="bold">
                    .geojson
                  </Text>{" "}
                  de lote único aquí, o hacé clic para buscar
                </Text>
                <Text size="1" color="gray" align="center">
                  Polygon o MultiPolygon · máximo 5 MB
                </Text>
              </Flex>
            )}
          </Flex>
        </Box>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -6, height: 0 }}
              animate={{ opacity: 1, y: 0, height: "auto" }}
              exit={{ opacity: 0, y: -6, height: 0 }}
              transition={{ duration: 0.2 }}
              style={{ overflow: "hidden" }}
            >
              <Box mt="3">
                <Callout.Root size="1" variant="soft" color="red" role="alert">
                  <Callout.Icon>
                    <AlertTriangle size={14} aria-hidden />
                  </Callout.Icon>
                  <Callout.Text>{error}</Callout.Text>
                </Callout.Root>
              </Box>
            </motion.div>
          )}
        </AnimatePresence>

        <Flex gap="3" justify="end" mt="4">
          <Dialog.Close>
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={procesando}
            >
              Cerrar
            </Button>
          </Dialog.Close>
          <Button
            type="button"
            color="jade"
            onClick={abrirSelector}
            disabled={procesando || exito}
          >
            {procesando ? (
              <>
                <Loader2 size={16} className="animate-spin" aria-hidden />
                Procesando…
              </>
            ) : (
              <>
                <CloudUpload size={16} aria-hidden />
                Buscar archivo
              </>
            )}
          </Button>
        </Flex>
      </Dialog.Content>
    </Dialog.Root>
  );
}

/** Icono central del dropzone según el estado de la carga. */
function DropzoneIcon({
  status,
  isDragging,
}: {
  status: Status;
  isDragging: boolean;
}) {
  const wrapperStyle = {
    width: 64,
    height: 64,
    borderRadius: "var(--radius-5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background-color 160ms ease",
  } as const;

  if (status === "processing") {
    return (
      <Box
        style={{
          ...wrapperStyle,
          background: "color-mix(in srgb, var(--iris-9) 14%, transparent)",
        }}
      >
        <Loader2
          size={30}
          className="animate-spin"
          aria-hidden
          style={{ color: "var(--iris-11)" }}
        />
      </Box>
    );
  }

  if (status === "success") {
    return (
      <Box
        style={{
          ...wrapperStyle,
          background: "color-mix(in srgb, var(--jade-9) 16%, transparent)",
        }}
      >
        <CheckCircle2 size={32} aria-hidden style={{ color: "var(--jade-11)" }} />
      </Box>
    );
  }

  return (
    <Box
      style={{
        ...wrapperStyle,
        background: isDragging
          ? "color-mix(in srgb, var(--jade-9) 18%, transparent)"
          : "var(--gray-a3)",
      }}
    >
      {isDragging ? (
        <CloudUpload size={32} aria-hidden style={{ color: "var(--jade-11)" }} />
      ) : (
        <FileJson size={30} aria-hidden style={{ color: "var(--gray-11)" }} />
      )}
    </Box>
  );
}
