"use client";

import { login, signup } from "@/app/actions/auth";
import { createClient } from "@/utils/supabase/client";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  Check,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import { useState } from "react";

type AuthTab = "login" | "signup";

type AuthFormProps = {
  initialTab: AuthTab;
  errorMessage?: string | null;
  successMessage?: string | null;
};

export default function AuthForm({
  initialTab,
  errorMessage = null,
  successMessage = null,
}: AuthFormProps) {
  const [mode, setMode] = useState<AuthTab>(initialTab);
  const [pending, setPending] = useState(false);
  const [googlePending, setGooglePending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [oauthError, setOauthError] = useState<string | null>(null);

  // Los banners vienen del server (redirect con ?error/?message). Se ocultan
  // si el usuario alterna manualmente entre login/registro para no mostrar un
  // mensaje que ya no corresponde al modo visible.
  const [bannersDismissed, setBannersDismissed] = useState(false);
  const displayedError =
    oauthError ?? (bannersDismissed ? null : errorMessage);
  const showSuccess = !bannersDismissed && successMessage;

  const isSignup = mode === "signup";
  const busy = pending || googlePending;

  const handleSubmit = (formData: FormData) => {
    setPending(true);
    const action = isSignup ? signup : login;
    // La server action redirige (éxito → /mapa, error → /?error=…). Si por
    // algún motivo retornara sin navegar, liberamos el estado de carga.
    void Promise.resolve(action(formData)).finally(() => setPending(false));
  };

  const handleGoogle = async () => {
    setOauthError(null);
    setGooglePending(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) {
        setOauthError(error.message);
        setGooglePending(false);
      }
      // En éxito el navegador se redirige a Google; no liberamos el estado.
    } catch {
      setOauthError("No pudimos conectar con Google. Intentá nuevamente.");
      setGooglePending(false);
    }
  };

  const toggleMode = () => {
    setBannersDismissed(true);
    setOauthError(null);
    setShowPassword(false);
    setMode((prev) => (prev === "login" ? "signup" : "login"));
  };

  return (
    <div className="w-full">
      {/* Título (la marca vive en la cabecera de la columna) */}
      <div className="mb-7">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={mode}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
          >
            <h1 className="text-2xl font-bold tracking-tight text-slate-50">
              {isSignup ? "Creá tu cuenta" : "Bienvenido de vuelta"}
            </h1>
            <p className="mt-1.5 text-sm text-slate-400">
              {isSignup
                ? "Empezá a monitorear la salud de tus lotes en minutos."
                : "Ingresá para acceder al monitoreo satelital de tus campos."}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>

      {/* Banners de estado */}
      {displayedError ? (
        <div
          role="alert"
          className="animate-fade-in mb-5 flex items-start gap-3 rounded-xl border border-red-500/25 bg-red-950/40 p-3.5"
        >
          <AlertCircle
            size={18}
            aria-hidden
            className="mt-0.5 shrink-0 text-red-400"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-red-100">
              No pudimos completar la operación
            </p>
            <p className="mt-0.5 text-sm text-red-200/80">{displayedError}</p>
          </div>
        </div>
      ) : null}

      {showSuccess ? (
        <div
          role="status"
          className="animate-fade-in mb-5 flex items-start gap-3 rounded-xl border border-emerald-500/25 bg-emerald-950/40 p-3.5"
        >
          <CheckCircle2
            size={18}
            aria-hidden
            className="mt-0.5 shrink-0 text-emerald-400"
          />
          <div className="min-w-0">
            <p className="text-sm font-medium text-emerald-100">
              Registro exitoso
            </p>
            <p className="mt-0.5 text-sm text-emerald-200/80">
              {successMessage}
            </p>
          </div>
        </div>
      ) : null}

      {/* Inicio de sesión social */}
      <button
        type="button"
        onClick={() => void handleGoogle()}
        disabled={busy}
        className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-700/60 bg-slate-800/50 py-3 text-sm font-medium text-slate-200 transition-colors duration-200 hover:border-slate-600 hover:bg-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/40 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {googlePending ? (
          <Loader2 size={18} className="animate-spin" aria-hidden />
        ) : (
          <GoogleIcon />
        )}
        Continuar con Google
      </button>

      {/* Divisor de línea calada (el bg del span coincide con el contenedor) */}
      <div className="relative my-6">
        <div className="absolute inset-0 flex items-center">
          <div className="w-full border-t border-slate-800/80" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-[#090d16] px-2 tracking-wider text-slate-500">
            o ingresa con tu correo
          </span>
        </div>
      </div>

      {/* Formulario */}
      <form action={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-xs font-medium text-slate-300"
          >
            Correo electrónico
          </label>
          <div className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 transition-all duration-200 hover:border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <Mail
              size={16}
              aria-hidden
              className="shrink-0 text-slate-400 transition-colors group-focus-within:text-emerald-400"
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={busy}
              placeholder="productor@campo.com.ar"
              className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        {/* Contraseña */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-300"
            >
              Contraseña
            </label>
            {!isSignup ? (
              <a
                href="mailto:soporte@terrascan.app?subject=Recuperar%20contrase%C3%B1a"
                className="text-xs text-slate-400 underline-offset-2 transition-colors hover:text-emerald-400 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </a>
            ) : null}
          </div>
          <div className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 transition-all duration-200 hover:border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <Lock
              size={16}
              aria-hidden
              className="shrink-0 text-slate-400 transition-colors group-focus-within:text-emerald-400"
            />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 6 : 1}
              disabled={busy}
              placeholder="••••••••"
              className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={busy}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              aria-pressed={showPassword}
              className="shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:text-slate-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden />
              ) : (
                <Eye size={16} aria-hidden />
              )}
            </button>
          </div>
          {isSignup ? (
            <p className="mt-1.5 text-xs text-slate-400">Mínimo 6 caracteres.</p>
          ) : null}
        </div>

        {/* Recordar sesión (sólo login) — checkbox cuadrado premium */}
        {!isSignup ? (
          <label className="flex w-fit cursor-pointer items-center gap-2.5 select-none">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={busy}
                className="peer sr-only"
              />
              <span className="flex h-4 w-4 items-center justify-center rounded-[5px] border border-slate-600 bg-slate-900/60 transition-colors peer-checked:border-emerald-700/70 peer-checked:bg-emerald-700/70 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/30">
                <Check
                  size={11}
                  strokeWidth={3}
                  aria-hidden
                  className="text-slate-100 opacity-0 transition-opacity peer-checked:opacity-100"
                />
              </span>
            </span>
            <span className="text-sm text-slate-400">Recordar sesión</span>
          </label>
        ) : null}

        {/* Submit */}
        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-900/40 transition-all duration-200 hover:bg-emerald-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2 focus-visible:ring-offset-[#090d16] disabled:cursor-not-allowed disabled:opacity-70"
        >
          {pending ? (
            <>
              <Loader2 size={16} className="animate-spin" aria-hidden />
              {isSignup ? "Creando cuenta…" : "Ingresando…"}
            </>
          ) : isSignup ? (
            "Crear cuenta gratis"
          ) : (
            "Ingresar"
          )}
        </button>
      </form>

      {/* Flujo alternativo */}
      <p className="mt-7 text-center text-sm text-slate-400">
        {isSignup ? "¿Ya tenés una cuenta? " : "¿No tenés una cuenta aún? "}
        <button
          type="button"
          onClick={toggleMode}
          disabled={busy}
          className="font-semibold text-emerald-400 underline-offset-2 transition-colors hover:text-emerald-300 hover:underline disabled:opacity-60"
        >
          {isSignup ? "Iniciá sesión" : "Registrate gratis"}
        </button>
      </p>
    </div>
  );
}

/** Logo vectorial oficial de Google (multicolor). */
function GoogleIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      aria-hidden
      focusable="false"
    >
      <path
        fill="#4285F4"
        d="M23.52 12.273c0-.851-.076-1.67-.218-2.455H12v4.642h6.458a5.52 5.52 0 0 1-2.394 3.622v3.01h3.878c2.27-2.09 3.578-5.167 3.578-8.82z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.956-1.075 7.942-2.908l-3.878-3.01c-1.075.72-2.45 1.145-4.064 1.145-3.126 0-5.77-2.112-6.713-4.95H1.276v3.11A11.997 11.997 0 0 0 12 24z"
      />
      <path
        fill="#FBBC05"
        d="M5.287 14.277A7.213 7.213 0 0 1 4.91 12c0-.79.136-1.557.377-2.277V6.613H1.276A11.997 11.997 0 0 0 0 12c0 1.936.464 3.768 1.276 5.387l4.011-3.11z"
      />
      <path
        fill="#EA4335"
        d="M12 4.773c1.762 0 3.344.605 4.59 1.793l3.44-3.44C17.952 1.19 15.236 0 12 0A11.997 11.997 0 0 0 1.276 6.613l4.011 3.11C6.23 6.885 8.874 4.773 12 4.773z"
      />
    </svg>
  );
}
