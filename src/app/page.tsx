import AuthForm from "@/components/AuthForm";
import { Layers, Leaf, Radar, Satellite, Sprout } from "lucide-react";
import type { ReactNode } from "react";

type HomePageProps = {
  searchParams: Promise<{
    error?: string;
    message?: string;
    tab?: string;
  }>;
};

export default async function HomePage({ searchParams }: HomePageProps) {
  const params = await searchParams;
  const initialTab = params.tab === "signup" ? "signup" : "login";
  const errorMessage = params.error?.trim() || null;
  const successMessage = params.message?.trim() || null;

  return (
    <main className="flex min-h-dvh w-full bg-[#090d16] text-slate-100">
      {/* ── Lado izquierdo (40%): formulario ──────────────────────────────── */}
      <section className="flex w-full flex-col justify-center px-6 py-10 sm:px-12 md:p-16 lg:w-2/5 lg:border-r lg:border-slate-800/70">
        <div className="mx-auto w-full max-w-md">
          <AuthForm
            key={initialTab}
            initialTab={initialTab}
            errorMessage={errorMessage}
            successMessage={successMessage}
          />
        </div>
      </section>

      {/* ── Lado derecho (60%): panel de marca (oculto en mobile/tablet) ──── */}
      <BrandPanel />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function BrandPanel() {
  return (
    <aside className="relative hidden overflow-hidden bg-[#070b13] lg:flex lg:w-3/5 lg:flex-col lg:justify-between">
      {/* Glows radiales esmeralda + teal */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          backgroundImage:
            "radial-gradient(ellipse 50% 45% at 75% 18%, rgba(16,185,129,0.16), transparent 70%), radial-gradient(ellipse 45% 45% at 20% 90%, rgba(20,184,166,0.12), transparent 70%)",
        }}
      />
      {/* Grilla técnica de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-size-[3.5rem_3.5rem] bg-[linear-gradient(to_right,rgba(51,65,85,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.10)_1px,transparent_1px)] mask-[radial-gradient(ellipse_70%_70%_at_50%_40%,black,transparent)]"
      />

      {/* Wordmark superior */}
      <div className="relative z-10 flex items-center gap-2.5 p-12">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950">
          <Leaf size={20} strokeWidth={2.25} aria-hidden />
        </span>
        <span className="text-lg font-bold tracking-tight text-slate-50">
          Terra Scan
        </span>
      </div>

      {/* Tarjeta flotante de valor */}
      <div className="relative z-10 px-12">
        <div className="max-w-lg rounded-3xl border border-slate-700/50 bg-slate-900/40 p-8 shadow-2xl shadow-emerald-950/30 backdrop-blur-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
            <Radar size={13} aria-hidden />
            Monitoreo satelital en tiempo casi real
          </span>

          <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-slate-50">
            Inteligencia agronómica para cada hectárea de tu campo
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Analizamos el historial satelital de tus lotes con imágenes{" "}
            <span className="font-semibold text-emerald-300">Sentinel-2</span> a{" "}
            <span className="font-semibold text-emerald-300">10 m por píxel</span>
            , detectando estrés hídrico, salud del cultivo y riesgos antes de que
            sean visibles a simple vista.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <FeaturePill icon={<Satellite size={15} aria-hidden />} label="Sentinel-2 · 10m/px" />
            <FeaturePill icon={<Sprout size={15} aria-hidden />} label="Índice NDVI de salud" />
            <FeaturePill icon={<Layers size={15} aria-hidden />} label="Histórico multitemporal" />
            <FeaturePill icon={<Radar size={15} aria-hidden />} label="Alertas de incendios" />
          </div>
        </div>
      </div>

      {/* Pie del panel */}
      <div className="relative z-10 p-12 text-xs text-slate-500">
        Cobertura completa de la Región Pampeana · Datos satelitales abiertos de
        la ESA
      </div>
    </aside>
  );
}

function FeaturePill({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-slate-700/40 bg-slate-800/30 px-3 py-2.5">
      <span className="text-emerald-400">{icon}</span>
      <span className="text-xs font-medium text-slate-300">{label}</span>
    </div>
  );
}
