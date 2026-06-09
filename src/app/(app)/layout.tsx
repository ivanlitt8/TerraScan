import Sidebar from "@/components/Sidebar";
import type { ReactNode } from "react";

/**
 * Layout del área autenticada (SaaS): Sidebar fija a la izquierda + contenido.
 * El route group `(app)` no altera las URLs (`/mapa` sigue siendo `/mapa`).
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex h-dvh w-full overflow-hidden">
      <Sidebar />
      <main className="h-full min-w-0 flex-1 overflow-hidden">{children}</main>
    </div>
  );
}
