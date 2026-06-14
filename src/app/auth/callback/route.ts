import { createClient } from "@/utils/supabase/server";
import { NextResponse } from "next/server";

/**
 * Callback de OAuth (Google) con el flujo PKCE de Supabase. El proveedor
 * redirige aquí con un `?code=…` que intercambiamos por una sesión persistida
 * en cookies (Route Handler sí puede mutar cookies). Ante cualquier fallo
 * volvemos al login con un mensaje legible vía query param.
 */
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/mapa";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  const params = new URLSearchParams({
    tab: "login",
    error: "No pudimos iniciar sesión con Google. Intentá nuevamente.",
  });
  return NextResponse.redirect(`${origin}/?${params.toString()}`);
}
