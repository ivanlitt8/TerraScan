import type { LucideIcon } from "lucide-react";

type PlaceholderScreenProps = {
  title: string;
  description: string;
  icon: LucideIcon;
};

/**
 * Pantalla genérica "en construcción" para las rutas del SaaS que todavía no
 * tienen su vista definitiva. Mantiene la navegación de la Sidebar funcional
 * (sin 404) mientras se desarrollan los módulos reales.
 */
export default function PlaceholderScreen({
  title,
  description,
  icon: Icon,
}: PlaceholderScreenProps) {
  return (
    <div className="agro-panel flex h-full w-full items-center justify-center p-8">
      <div className="flex max-w-md flex-col items-center gap-4 text-center">
        <div
          className="flex items-center justify-center"
          style={{
            width: 56,
            height: 56,
            borderRadius: "var(--radius-4)",
            backgroundColor: "var(--jade-a4)",
            color: "var(--jade-11)",
          }}
        >
          <Icon size={28} strokeWidth={2} aria-hidden />
        </div>

        <div className="flex flex-col gap-2">
          <h1
            style={{
              margin: 0,
              fontSize: "var(--font-size-6)",
              fontWeight: 700,
              color: "var(--gray-12)",
              letterSpacing: "-0.01em",
            }}
          >
            {title}
          </h1>
          <p style={{ margin: 0, color: "var(--gray-11)", lineHeight: 1.5 }}>
            {description}
          </p>
        </div>

        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            padding: "4px 10px",
            borderRadius: "var(--radius-full)",
            backgroundColor: "var(--amber-a3)",
            color: "var(--amber-11)",
            fontSize: "var(--font-size-1)",
            fontWeight: 500,
          }}
        >
          En construcción
        </span>
      </div>
    </div>
  );
}
