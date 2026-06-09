"use client";

import EstablecimientoDetalleView from "@/components/establecimientos/EstablecimientoDetalleView";
import { useParams } from "next/navigation";

export default function EstablecimientoDetallePage() {
  const params = useParams<{ establecimientoId: string }>();
  return (
    <EstablecimientoDetalleView establecimientoId={params.establecimientoId} />
  );
}
