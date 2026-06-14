import AuthForm from "@/components/AuthForm";
import SatelliteBackdrop from "@/components/login/SatelliteBackdrop";
import { Layers, Leaf, Radar, Satellite, Sprout } from "lucide-react";
import Link from "next/link";
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
    <main className="flex min-h-dvh w-full overflow-x-hidden bg-[#090d16] text-slate-100">
      {/* ── Lado izquierdo (40%): cabecera de marca + formulario + pie ────── */}
      <section className="flex min-h-screen w-full min-w-0 flex-col justify-between px-8 py-12 sm:px-12 md:px-16 lg:w-2/5 lg:border-r lg:border-slate-800/70">
        {/* Cabecera de marca unificada */}
        <header className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500 text-emerald-950">
            <Leaf size={20} strokeWidth={2.25} aria-hidden />
          </span>
          <span className="text-lg font-bold tracking-tight text-slate-50">
            TerraScan
          </span>
        </header>

        {/* Formulario centrado verticalmente */}
        <div className="flex flex-1 items-center py-10">
          <div className="mx-auto w-full max-w-md">
            <AuthForm
              key={initialTab}
              initialTab={initialTab}
              errorMessage={errorMessage}
              successMessage={successMessage}
            />
          </div>
        </div>

        {/* Pie de página izquierdo */}
        <footer className="mb-4 text-xs text-slate-600">
          <Link
            href="/mapa"
            className="underline-offset-2 transition-colors hover:text-slate-400 hover:underline"
          >
            Explorar el mapa sin cuenta
          </Link>
        </footer>
      </section>

      {/* ── Lado derecho (60%): panel de marca (oculto en mobile/tablet) ──── */}
      <BrandPanel />
    </main>
  );
}

/* ──────────────────────────────────────────────────────────────────────── */

function BrandPanel() {
  return (
    <aside className="relative hidden min-w-0 overflow-hidden bg-[#070b13] p-16 lg:flex lg:w-3/5 lg:items-center lg:justify-center">
      {/* Fondo satelital animado: glow pulsante + ondas de radar */}
      <SatelliteBackdrop />

      {/* Grilla técnica de fondo */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-size-[3.5rem_3.5rem] bg-[linear-gradient(to_right,rgba(51,65,85,0.10)_1px,transparent_1px),linear-gradient(to_bottom,rgba(51,65,85,0.10)_1px,transparent_1px)] mask-[radial-gradient(ellipse_70%_70%_at_50%_40%,black,transparent)]"
      />

      {/* Tarjeta flotante de valor (centrada simétricamente en su panel) */}
      <div className="relative z-10 flex w-full justify-center">
        <div className="w-full max-w-xl rounded-3xl border border-slate-700/50 bg-slate-900/40 p-8 shadow-2xl shadow-emerald-950/30 backdrop-blur-xl">
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-3 py-1 text-xs font-medium text-emerald-300">
          <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true" />
            Inteligencia Geoespacial
          </span>

          <h2 className="mt-5 text-3xl font-bold leading-tight tracking-tight text-slate-50">
            Análisis geoespacial avanzado para la gestión y evaluación de la tierra
          </h2>
          <p className="mt-3 text-sm leading-relaxed text-slate-400">
            Procesamos  analíticas satelitales de alta resolución para auditar riesgos,{" "}
            <br /> verificar el historial multitemporal de suelos y maximizar el
            rendimiento de activos rurales.
          </p>

          <div className="mt-7 grid grid-cols-2 gap-3">
            <FeaturePill icon={<Satellite size={15} aria-hidden />} label="Evolución histórica de suelos" />
            <FeaturePill icon={<Sprout size={15} aria-hidden />} label="Índices de salud y NDVI" />
            <FeaturePill icon={<Layers size={15} aria-hidden />} label="Auditoría de riesgos ambientales" />
            <FeaturePill icon={<Radar size={15} aria-hidden />} label="Actualización periódica" />
          </div>
        </div>
      </div>

      {/* Pie del panel */}
      <div className="absolute bottom-0 left-0 right-0 z-10 px-12 pb-20 text-center text-xs text-slate-500">
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
