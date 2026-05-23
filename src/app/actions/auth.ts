"use server";

import { createClient } from "@/utils/supabase/server";
import { redirect } from "next/navigation";

function authRedirectPath(
  tab: "login" | "signup",
  params: Record<string, string>,
): string {
  const search = new URLSearchParams({ tab, ...params });
  return `/?${search.toString()}`;
}

export async function login(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(
      authRedirectPath("login", {
        error: "Completá el correo y la contraseña.",
      }),
    );
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    redirect(
      authRedirectPath("login", {
        error: error.message,
      }),
    );
  }

  redirect("/mapa");
}

export async function signup(formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    redirect(
      authRedirectPath("signup", {
        error: "Completá el correo y la contraseña.",
      }),
    );
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({ email, password });

  if (error) {
    redirect(
      authRedirectPath("signup", {
        error: error.message,
      }),
    );
  }

  if (data.session) {
    redirect("/mapa");
  }

  redirect(
    authRedirectPath("signup", {
      message:
        "Cuenta creada. Revisá tu correo para confirmar el acceso a TerraScan.",
    }),
  );
}
