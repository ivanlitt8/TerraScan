"use client";

import { login, signup } from "@/app/actions/auth";
import { AnimatePresence, motion } from "framer-motion";
import {
  AlertCircle,
  CheckCircle2,
  Eye,
  EyeOff,
  Leaf,
  Loader2,
  Lock,
  Mail,
} from "lucide-react";
import Link from "next/link";
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
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  // Los banners vienen del server (redirect con ?error/?message). Se ocultan
  // si el usuario alterna manualmente entre login/registro para no mostrar un
  // mensaje que ya no corresponde al modo visible.
  const [bannersDismissed, setBannersDismissed] = useState(false);
  const showError = !bannersDismissed && errorMessage;
  const showSuccess = !bannersDismissed && successMessage;

  const isSignup = mode === "signup";

  const handleSubmit = (formData: FormData) => {
    setPending(true);
    const action = isSignup ? signup : login;
    // La server action redirige (éxito → /mapa, error → /?error=…). Si por
    // algún motivo retornara sin navegar, liberamos el estado de carga.
    void Promise.resolve(action(formData)).finally(() => setPending(false));
  };

  const toggleMode = () => {
    setBannersDismissed(true);
    setShowPassword(false);
    setMode((prev) => (prev === "login" ? "signup" : "login"));
  };

  return (
    <div className="w-full">
      {/* Marca + título */}
      <div className="mb-8">
        <span className="mb-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
          <Leaf size={22} strokeWidth={2.25} aria-hidden />
        </span>
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
      {showError ? (
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
            <p className="mt-0.5 text-sm text-red-200/80">{errorMessage}</p>
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

      {/* Formulario */}
      <form action={handleSubmit} className="space-y-5">
        {/* Email */}
        <div>
          <label
            htmlFor="email"
            className="mb-1.5 block text-xs font-medium text-slate-400"
          >
            Correo electrónico
          </label>
          <div className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 transition-all duration-200 hover:border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <Mail
              size={16}
              aria-hidden
              className="shrink-0 text-slate-500 transition-colors group-focus-within:text-emerald-400"
            />
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              disabled={pending}
              placeholder="productor@campo.com.ar"
              className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-60"
            />
          </div>
        </div>

        {/* Contraseña */}
        <div>
          <div className="mb-1.5 flex items-center justify-between">
            <label
              htmlFor="password"
              className="block text-xs font-medium text-slate-400"
            >
              Contraseña
            </label>
            {!isSignup ? (
              <a
                href="mailto:soporte@terrascan.app?subject=Recuperar%20contrase%C3%B1a"
                className="text-xs text-slate-500 underline-offset-2 transition-colors hover:text-emerald-400 hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </a>
            ) : null}
          </div>
          <div className="group flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-900/50 px-3.5 transition-all duration-200 hover:border-slate-700 focus-within:border-emerald-500/50 focus-within:ring-2 focus-within:ring-emerald-500/20">
            <Lock
              size={16}
              aria-hidden
              className="shrink-0 text-slate-500 transition-colors group-focus-within:text-emerald-400"
            />
            <input
              id="password"
              name="password"
              type={showPassword ? "text" : "password"}
              autoComplete={isSignup ? "new-password" : "current-password"}
              required
              minLength={isSignup ? 6 : 1}
              disabled={pending}
              placeholder="••••••••"
              className="w-full bg-transparent py-3 text-sm text-slate-100 placeholder:text-slate-600 focus:outline-none disabled:opacity-60"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              disabled={pending}
              aria-label={
                showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
              }
              aria-pressed={showPassword}
              className="shrink-0 rounded-md p-1 text-slate-500 transition-colors hover:text-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500/40"
            >
              {showPassword ? (
                <EyeOff size={16} aria-hidden />
              ) : (
                <Eye size={16} aria-hidden />
              )}
            </button>
          </div>
          {isSignup ? (
            <p className="mt-1.5 text-xs text-slate-500">Mínimo 6 caracteres.</p>
          ) : null}
        </div>

        {/* Recordar sesión (sólo login) */}
        {!isSignup ? (
          <label className="flex w-fit cursor-pointer items-center gap-2.5 select-none">
            <span className="relative inline-flex">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                disabled={pending}
                className="peer sr-only"
              />
              <span className="h-5 w-9 rounded-full bg-slate-700 transition-colors peer-checked:bg-emerald-600 peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-500/40" />
              <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white transition-transform peer-checked:translate-x-4" />
            </span>
            <span className="text-sm text-slate-400">Recordar sesión</span>
          </label>
        ) : null}

        {/* Submit */}
        <button
          type="submit"
          disabled={pending}
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
          disabled={pending}
          className="font-semibold text-emerald-400 underline-offset-2 transition-colors hover:text-emerald-300 hover:underline disabled:opacity-60"
        >
          {isSignup ? "Iniciá sesión" : "Registrate gratis"}
        </button>
      </p>

      <p className="mt-4 text-center text-xs text-slate-600">
        <Link
          href="/mapa"
          className="underline-offset-2 transition-colors hover:text-slate-400 hover:underline"
        >
          Explorar el mapa sin cuenta
        </Link>
      </p>
    </div>
  );
}
