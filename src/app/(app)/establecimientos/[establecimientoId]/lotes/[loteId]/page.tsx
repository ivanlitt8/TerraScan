"use client";

import LoteDetalleView from "@/components/lote/LoteDetalleView";
import { useParams } from "next/navigation";

/**
 * Ficha de detalle de un lote dentro de la jerarquía de establecimientos.
 * `establecimientoId` es un segmento de ruta estable (ver `DEFAULT_ESTABLECIMIENTO_ID`)
 * hasta que exista la entidad Establecimiento en el backend.
 */
export default function LoteDetallePage() {
  const params = useParams<{
    establecimientoId: string;
    loteId: string;
  }>();

  return (
    <LoteDetalleView
      establecimientoId={params.establecimientoId}
      loteId={params.loteId}
    />
  );
}
