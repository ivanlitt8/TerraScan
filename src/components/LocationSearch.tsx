"use client";

import { parseCoordinates } from "@/lib/parseCoordinates";
import {
  buildFlyToFromCoordinates,
  type FlyToLocation,
} from "@/lib/locationSearch";
import { ApiServiceError, searchLocation } from "@/services/apiService";
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
    <div className="pointer-events-auto w-full max-w-xl">
      <form
        onSubmit={handleSubmit}
        className="flex flex-col gap-2 rounded-lg bg-black/80 p-3 shadow-lg backdrop-blur-sm"
      >
        <label htmlFor="location-search" className="sr-only">
          Buscar zona
        </label>
        <div className="flex gap-2">
          <input
            id="location-search"
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            disabled={disabled || loading}
            placeholder="Localidad, referencia rural o coordenadas"
            className="min-w-0 flex-1 rounded-md border border-white/20 bg-white/10 px-3 py-2 text-sm text-white placeholder:text-zinc-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500 disabled:opacity-50"
            autoComplete="off"
          />
          <button
            type="submit"
            disabled={disabled || loading || !query.trim()}
            className="shrink-0 rounded-md bg-sky-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-zinc-600"
          >
            {loading ? "…" : "Ir"}
          </button>
        </div>
        <p className="text-xs text-zinc-300">
          Ej: <span className="text-zinc-200">Bolívar, Buenos Aires</span> ·{" "}
          <span className="text-zinc-200">-36.23, -61.10</span>
        </p>
        <p className="text-xs text-zinc-400">
          Te llevamos cerca del lugar. Después marcá el lote en el mapa; no es
          precisión de puerta.
        </p>
        {hint && (
          <p className="text-xs text-amber-200" role="status">
            {hint}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-300" role="alert">
            {error}
          </p>
        )}
      </form>
    </div>
  );
}
