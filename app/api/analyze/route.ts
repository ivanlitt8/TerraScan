import {
  buildMockLoteAnalysis,
  delayProcessing,
  parseAnalyzeRequestBody,
} from "@/lib/mockLoteAnalysis";

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "El cuerpo de la solicitud debe ser JSON válido." },
      { status: 400 },
    );
  }

  const lote = parseAnalyzeRequestBody(body);

  if (!lote) {
    return Response.json(
      {
        error:
          "Se espera un GeoJSON Feature<Polygon> o un objeto { lote: Feature<Polygon> }.",
      },
      { status: 400 },
    );
  }

  await delayProcessing();

  const result = buildMockLoteAnalysis(lote);

  return Response.json(result);
}
