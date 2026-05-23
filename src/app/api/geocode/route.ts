import { ApiServiceError, fetchNominatimGeocode } from "@/services/apiService";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q")?.trim();

  if (!query) {
    return Response.json(
      { error: "Falta el parámetro de búsqueda." },
      { status: 400 },
    );
  }

  try {
    const location = await fetchNominatimGeocode(query, {
      next: { revalidate: 86400 },
    });

    return Response.json(location);
  } catch (error) {
    if (error instanceof ApiServiceError) {
      return Response.json({ error: error.message }, { status: error.status });
    }

    return Response.json(
      { error: "Error inesperado al buscar la zona." },
      { status: 500 },
    );
  }
}
