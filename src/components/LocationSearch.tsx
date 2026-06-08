"use client";

import { parseCoordinates } from "@/lib/parseCoordinates";
import {
  buildFlyToFromCoordinates,
  type FlyToLocation,
} from "@/lib/locationSearch";
import { ApiServiceError, searchLocation } from "@/services/apiService";
import { Box, Button, Flex, IconButton, Text, TextField, Tooltip } from "@radix-ui/themes";
import { AlertTriangle, Info, Loader2, Search, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type LocationSearchProps = {
  onGoTo: (location: FlyToLocation) => void;
  disabled?: boolean;
};

/** Notificación flotante (banner) que aparece bajo la barra de búsqueda. */
type Notice = {
  tone: "amber" | "red";
  message: string;
};

/** Mensaje de ayuda diferido al tooltip / focus del input. */
const HELP_TEXT =
  "Te llevamos cerca del lugar. Después marcá el lote en el mapa; no es precisión de puerta.";

/** Milisegundos antes de auto-ocultar una notificación de éxito. */
const AUTO_DISMISS_MS = 6000;

export default function LocationSearch({
  onGoTo,
  disabled = false,
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Auto-cierre: solo para notificaciones de éxito (amber). Los errores
  // permanecen hasta que el usuario los cierre o lance una nueva búsqueda.
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (dismissTimer.current) {
      clearTimeout(dismissTimer.current);
      dismissTimer.current = null;
    }
    if (notice?.tone === "amber") {
      dismissTimer.current = setTimeout(() => setNotice(null), AUTO_DISMISS_MS);
    }
    return () => {
      if (dismissTimer.current) clearTimeout(dismissTimer.current);
    };
  }, [notice]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || loading) return;

    const trimmed = query.trim();
    if (!trimmed) return;

    setNotice(null);
    setLoading(true);

    try {
      const coordinates = parseCoordinates(trimmed);
      if (coordinates) {
        const location = buildFlyToFromCoordinates(
          coordinates.lat,
          coordinates.lng,
        );
        if (!location.inPampas) {
          setNotice({
            tone: "red",
            message:
              "Esas coordenadas quedan fuera de la Región Pampeana. Terrascan cubre Buenos Aires, Santa Fe, Córdoba, Entre Ríos y La Pampa.",
          });
          return;
        }
        onGoTo(location);
        setNotice({
          tone: "amber",
          message:
            "Coordenadas ubicadas en el mapa. Ahora dibujá el contorno del lote.",
        });
        return;
      }

      const data = await searchLocation(trimmed);

      if (!data.inPampas) {
        setNotice({
          tone: "red",
          message:
            "Esa búsqueda cae fuera de la Región Pampeana. Probá otra localidad o coordenadas dentro del área.",
        });
        return;
      }

      onGoTo(data);

      setNotice({
        tone: "amber",
        message:
          data.precision === "approximate"
            ? "Ubicación aproximada. Acercá el mapa y dibujá el contorno del lote sobre la imagen."
            : "Te llevamos a la zona. El marcador no es el lote: dibujalo con Dibujar lote.",
      });
    } catch (error) {
      setNotice({
        tone: "red",
        message:
          error instanceof ApiServiceError
            ? error.message
            : "Error de conexión al buscar la zona.",
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      // width="100%"
      position="relative"
      style={{ maxWidth: "36rem" }}
      className="pointer-events-auto w-[450px]"
    >
      {/* Barra de búsqueda: altura fija = una sola fila (input + botón). */}
      <Box
        px="2"
        py="2"
        className="agro-glass agro-surface"
        style={{ borderRadius: "var(--radius-4)" }}
      >
        <form onSubmit={handleSubmit}>
          <label htmlFor="location-search" className="sr-only">
            Buscar zona
          </label>
          <Flex gap="2" align="center">
            <Box flexGrow="1" style={{ minWidth: 0 }}>
              <TextField.Root
                id="location-search"
                size="2"
                placeholder="Ej: Bolívar, Buenos Aires o coordenadas…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                disabled={disabled || loading}
                autoComplete="off"
              >
                <TextField.Slot side="left">
                  <Search size={16} aria-hidden />
                </TextField.Slot>
                <TextField.Slot side="right">
                  <Tooltip content={HELP_TEXT}>
                    <IconButton
                      type="button"
                      size="1"
                      variant="ghost"
                      color="gray"
                      radius="full"
                      aria-label="Cómo funciona la búsqueda"
                    >
                      <Info size={15} aria-hidden />
                    </IconButton>
                  </Tooltip>
                </TextField.Slot>
              </TextField.Root>
            </Box>
            <Button
              type="submit"
              size="2"
              variant="solid"
              color="jade"
              disabled={disabled || loading || !query.trim()}
            >
              {loading ? (
                <Loader2 size={16} className="animate-spin" aria-hidden />
              ) : (
                "Ir"
              )}
            </Button>
          </Flex>
        </form>
      </Box>

      {/* Notificación flotante: no altera la altura de la barra. */}
      {notice && (
        <Box
          position="absolute"
          left="0"
          right="0"
          style={{ top: "calc(100% + var(--space-2))" }}
        >
          <Flex
            align="center"
            gap="2"
            px="3"
            py="2"
            className="agro-glass"
            role={notice.tone === "red" ? "alert" : "status"}
            style={{
              borderRadius: "var(--radius-4)",
              borderLeft: `3px solid var(--${notice.tone}-9)`,
            }}
          >
            <Flex
              align="center"
              flexShrink="0"
              style={{ color: `var(--${notice.tone}-11)` }}
            >
              {notice.tone === "red" ? (
                <AlertTriangle size={16} aria-hidden />
              ) : (
                <Info size={16} aria-hidden />
              )}
            </Flex>
            <Text size="1" style={{ flex: 1, lineHeight: 1.35 }}>
              {notice.message}
            </Text>
            <IconButton
              type="button"
              size="1"
              variant="ghost"
              color="gray"
              aria-label="Cerrar notificación"
              onClick={() => setNotice(null)}
              style={{ flexShrink: 0 }}
            >
              <X size={14} aria-hidden />
            </IconButton>
          </Flex>
        </Box>
      )}
    </Box>
  );
}
