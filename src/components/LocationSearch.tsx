"use client";

import { parseCoordinates } from "@/lib/parseCoordinates";
import {
  buildFlyToFromCoordinates,
  type FlyToLocation,
} from "@/lib/locationSearch";
import { ApiServiceError, searchLocation } from "@/services/apiService";
import {
  Box,
  Button,
  Callout,
  Card,
  Flex,
  Text,
  TextField,
} from "@radix-ui/themes";
import { Loader2, Search } from "lucide-react";
import { FormEvent, useState } from "react";

type LocationSearchProps = {
  onGoTo: (location: FlyToLocation) => void;
  disabled?: boolean;
};

export default function LocationSearch({
  onGoTo,
  disabled = false,
}: LocationSearchProps) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (disabled || loading) return;

    const trimmed = query.trim();
    if (!trimmed) return;

    setError(null);
    setHint(null);
    setLoading(true);

    try {
      const coordinates = parseCoordinates(trimmed);
      if (coordinates) {
        const location = buildFlyToFromCoordinates(
          coordinates.lat,
          coordinates.lng,
        );
        if (!location.inPampas) {
          setError(
            "Esas coordenadas quedan fuera de la Región Pampeana. Terrascan cubre Buenos Aires, Santa Fe, Córdoba, Entre Ríos y La Pampa.",
          );
          return;
        }
        onGoTo(location);
        setHint(
          "Coordenadas ubicadas en el mapa. Ahora dibujá el contorno del lote.",
        );
        return;
      }

      const data = await searchLocation(trimmed);

      if (!data.inPampas) {
        setError(
          "Esa búsqueda cae fuera de la Región Pampeana. Probá otra localidad o coordenadas dentro del área.",
        );
        return;
      }

      onGoTo(data);

      if (data.precision === "approximate") {
        setHint(
          "Ubicación aproximada. Acercá el mapa y dibujá el contorno del lote sobre la imagen.",
        );
      } else {
        setHint(
          "Te llevamos a la zona. El marcador no es el lote: dibujalo con Dibujar lote.",
        );
      }
    } catch (error) {
      if (error instanceof ApiServiceError) {
        setError(error.message);
      } else {
        setError("Error de conexión al buscar la zona.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box width="100%" style={{ maxWidth: "36rem" }} className="pointer-events-auto">
      <Card size="2" variant="surface">
        <form onSubmit={handleSubmit}>
          <Flex direction="column" gap="3">
            <label htmlFor="location-search" className="sr-only">
              Buscar zona
            </label>
            <Flex gap="2" align="center">
              <Box flexGrow="1" style={{ minWidth: 0 }}>
                <TextField.Root
                  id="location-search"
                  size="2"
                  placeholder="Localidad, referencia rural o coordenadas"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  disabled={disabled || loading}
                  autoComplete="off"
                >
                  <TextField.Slot side="left">
                    <Search size={16} aria-hidden />
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

            <Text size="1" color="gray">
              Ej:{" "}
              <Text as="span" color="gray" highContrast>
                Bolívar, Buenos Aires
              </Text>{" "}
              ·{" "}
              <Text as="span" color="gray" highContrast>
                -36.23, -61.10
              </Text>
            </Text>
            <Text size="1" color="gray">
              Te llevamos cerca del lugar. Después marcá el lote en el mapa; no es
              precisión de puerta.
            </Text>

            {hint && (
              <Callout.Root color="amber" size="1" role="status">
                <Callout.Text>{hint}</Callout.Text>
              </Callout.Root>
            )}
            {error && (
              <Callout.Root color="red" size="1" role="alert">
                <Callout.Text>{error}</Callout.Text>
              </Callout.Root>
            )}
          </Flex>
        </form>
      </Card>
    </Box>
  );
}
