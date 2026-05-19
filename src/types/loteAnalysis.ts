import type { Feature, Polygon } from "geojson";

/** Tipos de alerta histórica del lote (MVP). */
export type AlertaTipo = "incendio" | "inundacion";

/** Estado agroclimático de la campaña según NDVI. */
export type NdviEstado = "Sequía" | "Normal";

export type AlertaHistorica = {
  tipo: AlertaTipo;
  /** Fecha ISO (YYYY-MM-DD). */
  fecha: string;
  descripcion: string;
};

export type NdviCampania = {
  /** Año de campaña / serie temporal. */
  anio: number;
  /** Valor NDVI medio del lote (típ. 0–1). */
  ndvi: number;
  estado: NdviEstado;
};

/** Respuesta del análisis histórico del lote. */
export type LoteAnalysisResult = {
  hectareas: number;
  /** Score de salud histórica del campo (0–100). */
  scoreSalud: number;
  alertas: AlertaHistorica[];
  /** Últimas 8 campañas. */
  ndviSerie: NdviCampania[];
  /** Metadatos del mock (útil en desarrollo). */
  procesadoEn: string;
};

export type AnalyzeLoteRequestBody = {
  lote: Feature<Polygon>;
};
