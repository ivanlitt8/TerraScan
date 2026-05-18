import { isInPampas } from "@/lib/pampasBounds";

export type LocationPrecision = "coordinates" | "exact" | "locality" | "approximate";

export type FlyToLocation = {
  lat: number;
  lng: number;
  zoom: number;
  label: string;
  precision: LocationPrecision;
  inPampas: boolean;
};

export function zoomForPrecision(precision: LocationPrecision): number {
  switch (precision) {
    case "coordinates":
    case "exact":
      return 15;
    case "locality":
      return 13;
    case "approximate":
      return 11;
    default:
      return 12;
  }
}

export function buildFlyToFromCoordinates(
  lat: number,
  lng: number,
): FlyToLocation {
  const inPampas = isInPampas(lat, lng);
  return {
    lat,
    lng,
    zoom: zoomForPrecision("coordinates"),
    label: `${lat.toFixed(5)}, ${lng.toFixed(5)}`,
    precision: "coordinates",
    inPampas,
  };
}

export function nominatimTypeToPrecision(
  type: string,
  category: string,
): LocationPrecision {
  if (["house", "building", "farm", "isolated_dwelling"].includes(type)) {
    return "exact";
  }
  if (
    ["city", "town", "village", "municipality", "suburb", "locality"].includes(
      type,
    )
  ) {
    return "locality";
  }
  if (category === "place") return "locality";
  return "approximate";
}
