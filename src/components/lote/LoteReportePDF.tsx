"use client";

import {
  Circle,
  Document,
  G,
  Image,
  Line,
  Page,
  PDFDownloadLink,
  pdf,
  Polygon,
  Polyline,
  StyleSheet,
  Svg,
  Text,
  View,
} from "@react-pdf/renderer";
import { FileDown, Loader2 } from "lucide-react";
import { Button } from "@radix-ui/themes";
import {
  forwardRef,
  type ComponentProps,
  type ReactElement,
} from "react";

/* ────────────────────────────────────────────────────────────────────────
 * Contrato de datos del reporte (plano y desacoplado de los hooks).
 * El consumidor (`LoteDetalleView`) mapea sus hooks a esta forma; así la
 * plantilla no conoce Sentinel/FIRMS/GEE y es trivial de testear.
 * ──────────────────────────────────────────────────────────────────────── */

export interface ReporteInundacion {
  began: string | null;
  ended: string | null;
  duracionDias: number | null;
}

export interface ReporteFoco {
  fecha: string;
  /** Confianza ya legible: "Alta" | "Nominal" | "Baja" | "—". */
  confianza: string;
  frpMax: number | null;
  /** Satélites unidos por coma (e.g. "SNPP, N20"). */
  satelites: string;
}

export interface LoteReporteData {
  loteNombre: string;
  establecimientoNombre: string | null;
  generadoEn: Date;
  superficieHa: number | null;
  elevacionMedia: number | null;
  score: number | null;
  /** Estado legible (e.g. "Salud Alta"). */
  estadoSalud: string;
  ndviPromedio: number | null;
  /** Anillo exterior del polígono como pares `[lng, lat]` (sin normalizar). */
  geometriaPoligono: [number, number][];
  /**
   * Serie temporal NDVI (orden cronológico). Se dibuja nativa con primitivas
   * `<Svg>` de react-pdf — no se captura el DOM (html-to-image producía PNG en
   * blanco con el SVG de Recharts).
   */
  serieNdvi: { fecha: string; ndvi: number }[];
  /** ObjectURL o data URL del raster NDVI de Sentinel Hub. */
  rasterNdviUrl: string | null;
  /** Snapshot satelital (data URL) del mini-mapa. Best-effort. */
  mapaLoteBase64: string | null;
  inundaciones: ReporteInundacion[];
  focos: ReporteFoco[];
}

/* ──────────────────────────── Formateadores ───────────────────────────── */

const numero = (value: number | null | undefined, fracDigits = 0): string =>
  value === null || value === undefined || Number.isNaN(value)
    ? "—"
    : new Intl.NumberFormat("es-AR", {
        minimumFractionDigits: fracDigits,
        maximumFractionDigits: fracDigits,
      }).format(value);

const fechaCorta = (iso: string | null | undefined): string => {
  if (!iso) return "—";
  // Las fechas llegan como "YYYY-MM-DD" (UTC). Evitamos el desfase de zona
  // construyendo la fecha en local a partir de las partes.
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Intl.DateTimeFormat("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(y, m - 1, d));
};

const fechaHora = (date: Date): string =>
  new Intl.DateTimeFormat("es-AR", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(date);

/** Etiqueta corta `dd MMM` (UTC) para el eje X del gráfico NDVI. */
const fechaEjeX = (iso: string): string => {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "short",
    timeZone: "UTC",
  });
};

/** Color agronómico del punto NDVI (mismos cortes que el evalscript backend). */
const bandaColor = (ndvi: number): string => {
  if (ndvi < 0.2) return "#e5484d"; // estrés
  if (ndvi < 0.4) return "#ffc53d"; // pobre
  if (ndvi < 0.6) return "#29a383"; // moderada
  return "#2b9a66"; // vigorosa
};

/**
 * Normaliza el anillo del polígono a una lista de puntos `"x,y x,y …"` dentro
 * de un lienzo cuadrado (`size`), preservando proporción y centrando. Invierte
 * el eje Y porque en geografía la latitud crece hacia arriba y en SVG hacia
 * abajo.
 */
function poligonoPoints(
  coords: [number, number][],
  size = 150,
  pad = 10,
): string {
  if (!coords || coords.length < 3) return "";

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const [lng, lat] of coords) {
    if (lng < minX) minX = lng;
    if (lng > maxX) maxX = lng;
    if (lat < minY) minY = lat;
    if (lat > maxY) maxY = lat;
  }

  const w = maxX - minX || 1;
  const h = maxY - minY || 1;
  const inner = size - pad * 2;
  const scale = Math.min(inner / w, inner / h);
  const offsetX = (size - w * scale) / 2;
  const offsetY = (size - h * scale) / 2;

  return coords
    .map(([lng, lat]) => {
      const x = offsetX + (lng - minX) * scale;
      const y = offsetY + (maxY - lat) * scale;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(" ");
}

/* ──────────────────────────────── Estilos ─────────────────────────────── */

const COLORS = {
  ink: "#1f2937",
  inkStrong: "#111827",
  muted: "#6b7280",
  line: "#e5e7eb",
  lineSoft: "#f1f3f5",
  zebra: "#f8fafc",
  headerBg: "#f3f4f6",
  brand: "#15803d",
  brandSoft: "#dcfce7",
  white: "#ffffff",
};

const SVG_SIZE = 150;

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    color: COLORS.ink,
    fontFamily: "Helvetica",
    fontSize: 10,
    lineHeight: 1.4,
    paddingTop: 40,
    paddingBottom: 56,
    paddingHorizontal: 44,
  },

  /* Cabecera */
  brandRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    borderBottomWidth: 2,
    borderBottomColor: COLORS.brand,
    paddingBottom: 10,
  },
  brandName: {
    fontFamily: "Helvetica-Bold",
    fontSize: 16,
    color: COLORS.brand,
    letterSpacing: 0.5,
  },
  brandTag: { fontSize: 8, color: COLORS.muted, marginTop: 2 },
  genDate: { fontSize: 8, color: COLORS.muted, textAlign: "right" },

  titleBlock: { marginTop: 18 },
  loteTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 24,
    lineHeight: 1.2,
    color: COLORS.inkStrong,
    marginBottom: 8,
  },
  estabRow: { flexDirection: "row", marginTop: 2, alignItems: "center" },
  estabLabel: { fontSize: 9, color: COLORS.muted },
  estabValue: { fontSize: 10, color: COLORS.ink, fontFamily: "Helvetica-Bold" },

  /* Secciones */
  sectionTitle: {
    fontFamily: "Helvetica-Bold",
    fontSize: 12,
    color: COLORS.inkStrong,
    marginTop: 22,
    marginBottom: 10,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  subLabel: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
    marginBottom: 6,
  },

  /* Resumen técnico: KPIs + silueta */
  resumenRow: { flexDirection: "row", gap: 12, alignItems: "stretch" },
  kpiCol: { flexGrow: 1, flexBasis: 0, gap: 12 },
  kpiCard: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  kpiCardAccent: {
    borderWidth: 1,
    borderColor: COLORS.brandSoft,
    backgroundColor: COLORS.brandSoft,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  kpiLabel: {
    fontSize: 8,
    color: COLORS.muted,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  kpiValue: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: COLORS.inkStrong,
    marginTop: 5,
  },
  kpiValueBrand: {
    fontFamily: "Helvetica-Bold",
    fontSize: 18,
    color: COLORS.brand,
    marginTop: 5,
  },
  kpiUnit: { fontSize: 9, color: COLORS.muted, fontFamily: "Helvetica" },

  siluetaBox: {
    width: SVG_SIZE + 24,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    padding: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  siluetaCaption: {
    fontSize: 8,
    color: COLORS.muted,
    marginTop: 8,
    textAlign: "center",
  },

  /* KPIs en fila (diagnóstico) */
  kpiRow: { flexDirection: "row", gap: 12 },
  kpiRowCard: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  kpiRowCardAccent: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLORS.brandSoft,
    backgroundColor: COLORS.brandSoft,
    borderRadius: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },

  /* Contenedor dual de imágenes */
  imageRow: { flexDirection: "row", gap: 12 },
  imageCard: {
    flexGrow: 1,
    flexBasis: 0,
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  imageHeader: {
    backgroundColor: COLORS.headerBg,
    paddingVertical: 5,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  imageHeaderText: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.inkStrong,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
  imageBody: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fafafa",
  },
  image: { width: "100%", height: 180, objectFit: "contain" },

  chartBox: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    padding: 10,
    alignItems: "center",
  },

  placeholderBox: {
    height: 180,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  placeholderText: {
    fontSize: 9,
    color: COLORS.muted,
    fontStyle: "italic",
    textAlign: "center",
  },

  /* Tablas */
  table: {
    borderWidth: 1,
    borderColor: COLORS.line,
    borderRadius: 6,
    overflow: "hidden",
  },
  tableHeader: {
    flexDirection: "row",
    backgroundColor: COLORS.headerBg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.line,
  },
  tableRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
  },
  tableRowZebra: {
    flexDirection: "row",
    borderBottomWidth: 1,
    borderBottomColor: COLORS.lineSoft,
    backgroundColor: COLORS.zebra,
  },
  th: {
    fontFamily: "Helvetica-Bold",
    fontSize: 8.5,
    color: COLORS.inkStrong,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    paddingVertical: 7,
    paddingHorizontal: 8,
  },
  td: {
    fontSize: 9.5,
    color: COLORS.ink,
    paddingVertical: 6,
    paddingHorizontal: 8,
  },
  emptyRow: { paddingVertical: 14, paddingHorizontal: 8 },
  emptyText: {
    fontSize: 9.5,
    color: COLORS.muted,
    textAlign: "center",
    fontStyle: "italic",
  },

  /* Footer */
  footer: {
    position: "absolute",
    bottom: 24,
    left: 44,
    right: 44,
    flexDirection: "row",
    justifyContent: "space-between",
    borderTopWidth: 1,
    borderTopColor: COLORS.line,
    paddingTop: 6,
  },
  footerText: { fontSize: 7.5, color: COLORS.muted },
});

/* Anchos de columna por tabla (suma = 1). */
const colHidrico = { inicio: "30%", fin: "30%", duracion: "40%" };
const colTermico = {
  fecha: "26%",
  confianza: "24%",
  frp: "24%",
  satelite: "26%",
};

/* ─────────────────────────── Subcomponentes PDF ────────────────────────── */

function KpiCard({
  label,
  value,
  unit,
  accent,
  rowVariant,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: boolean;
  /** Usa los estilos de tarjeta en fila (diagnóstico) en vez de los de columna. */
  rowVariant?: boolean;
}) {
  const cardStyle = rowVariant
    ? accent
      ? styles.kpiRowCardAccent
      : styles.kpiRowCard
    : accent
      ? styles.kpiCardAccent
      : styles.kpiCard;
  return (
    <View style={cardStyle}>
      <Text style={styles.kpiLabel}>{label}</Text>
      <Text style={accent ? styles.kpiValueBrand : styles.kpiValue}>
        {value}
        {unit ? <Text style={styles.kpiUnit}> {unit}</Text> : null}
      </Text>
    </View>
  );
}

function EmptyTableRow({ message }: { message: string }) {
  return (
    <View style={styles.emptyRow}>
      <Text style={styles.emptyText}>{message}</Text>
    </View>
  );
}

function ImagePanel({
  title,
  src,
}: {
  title: string;
  src: string | null;
}) {
  return (
    <View style={styles.imageCard}>
      <View style={styles.imageHeader}>
        <Text style={styles.imageHeaderText}>{title}</Text>
      </View>
      {src ? (
        <View style={styles.imageBody}>
          {/* eslint-disable-next-line jsx-a11y/alt-text */}
          <Image src={src} style={styles.image} />
        </View>
      ) : (
        <View style={styles.placeholderBox}>
          <Text style={styles.placeholderText}>Imagen no disponible</Text>
        </View>
      )}
    </View>
  );
}

/* Gráfico NDVI nativo (vectorial) dibujado con primitivas SVG de react-pdf. */
const CHART = { w: 507, h: 210, left: 34, right: 14, top: 12, bottom: 24 };

function NdviChartSvg({
  serie,
}: {
  serie: { fecha: string; ndvi: number }[];
}) {
  const pts = [...serie].sort((a, b) => a.fecha.localeCompare(b.fecha));
  const n = pts.length;
  const { w, h, left, right, top, bottom } = CHART;
  const plotW = w - left - right;
  const plotH = h - top - bottom;

  const values = pts.map((p) => p.ndvi);
  let yMin = Math.min(...values);
  let yMax = Math.max(...values);
  if (yMin === yMax) {
    yMin -= 0.1;
    yMax += 0.1;
  } else {
    yMin -= 0.05;
    yMax += 0.05;
  }
  const range = yMax - yMin || 1;

  const xAt = (i: number) =>
    n === 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW;
  const yAt = (v: number) => top + (1 - (v - yMin) / range) * plotH;

  const polyline = pts
    .map((p, i) => `${xAt(i).toFixed(1)},${yAt(p.ndvi).toFixed(1)}`)
    .join(" ");

  const gridFracs = [0, 0.25, 0.5, 0.75, 1];
  const step = Math.max(1, Math.ceil(n / 6));
  const xLabelIdx = pts
    .map((_, i) => i)
    .filter((i) => i % step === 0 || i === n - 1);

  return (
    <Svg width={w} height={h}>
      {gridFracs.map((f, k) => {
        const y = top + f * plotH;
        const val = yMax - f * range;
        return (
          <G key={`grid-${k}`}>
            <Line
              x1={left}
              y1={y}
              x2={w - right}
              y2={y}
              stroke="#e5e7eb"
              strokeWidth={0.5}
            />
            <Text
              x={left - 5}
              y={y + 2.5}
              textAnchor="end"
              style={{ fontSize: 6, fill: "#94a3b8" }}
            >
              {val.toFixed(2)}
            </Text>
          </G>
        );
      })}

      <Polyline
        points={polyline}
        fill="none"
        stroke="#29a383"
        strokeWidth={1.5}
      />

      {pts.map((p, i) => (
        <Circle
          key={`dot-${i}`}
          cx={xAt(i)}
          cy={yAt(p.ndvi)}
          r={2}
          fill={bandaColor(p.ndvi)}
        />
      ))}

      {xLabelIdx.map((i) => (
        <Text
          key={`xlab-${i}`}
          x={xAt(i)}
          y={h - 8}
          textAnchor="middle"
          style={{ fontSize: 6, fill: "#94a3b8" }}
        >
          {fechaEjeX(pts[i].fecha)}
        </Text>
      ))}
    </Svg>
  );
}

function Footer() {
  return (
    <View style={styles.footer} fixed>
      <Text style={styles.footerText}>
        Terra Scan · Reporte generado automáticamente
      </Text>
      <Text
        style={styles.footerText}
        render={({ pageNumber, totalPages }) =>
          `Página ${pageNumber} de ${totalPages}`
        }
      />
    </View>
  );
}

/* ─────────────────────────── Documento principal ───────────────────────── */

export function LoteReportePDF({ data }: { data: LoteReporteData }) {
  const {
    loteNombre,
    establecimientoNombre,
    generadoEn,
    superficieHa,
    elevacionMedia,
    score,
    estadoSalud,
    ndviPromedio,
    geometriaPoligono,
    serieNdvi,
    rasterNdviUrl,
    mapaLoteBase64,
    inundaciones,
    focos,
  } = data;

  const puntos = poligonoPoints(geometriaPoligono, SVG_SIZE);

  return (
    <Document
      title={`Reporte ${loteNombre} — Terra Scan`}
      author="Terra Scan"
      subject="Reporte de diagnóstico de lote"
    >
      {/* ───────────────────── PÁGINA 1 · Identificación ───────────────── */}
      <Page size="A4" style={styles.page}>
        <View style={styles.brandRow}>
          <View>
            <Text style={styles.brandName}>TERRA SCAN</Text>
            <Text style={styles.brandTag}>
              Inteligencia satelital agronómica
            </Text>
          </View>
          <Text style={styles.genDate}>
            Generado el{"\n"}
            {fechaHora(generadoEn)}
          </Text>
        </View>

        <View style={styles.titleBlock}>
          <Text style={styles.loteTitle}>{loteNombre}</Text>
          <View style={styles.estabRow}>
            <Text style={styles.estabLabel}>Establecimiento: </Text>
            <Text style={styles.estabValue}>
              {establecimientoNombre ?? "Sin establecimiento asignado"}
            </Text>
          </View>
        </View>

        {/* Sección 1 — Resumen técnico (KPIs + silueta vectorial) */}
        <Text style={styles.sectionTitle}>1. Resumen técnico</Text>
        <View style={styles.resumenRow}>
          <View style={styles.kpiCol}>
            <KpiCard
              label="Superficie"
              value={numero(superficieHa, 1)}
              unit="ha"
            />
            <KpiCard
              label="Elevación media"
              value={numero(elevacionMedia, 0)}
              unit="m s.n.m."
            />
          </View>

          <View style={styles.siluetaBox}>
            <Svg width={SVG_SIZE} height={SVG_SIZE}>
              {puntos ? (
                <Polygon
                  points={puntos}
                  fill={COLORS.brandSoft}
                  stroke={COLORS.brand}
                  strokeWidth={2}
                />
              ) : null}
            </Svg>
            <Text style={styles.siluetaCaption}>Silueta del lote</Text>
          </View>
        </View>

        {/* Sección 2 — Diagnóstico de salud */}
        <Text style={styles.sectionTitle}>2. Diagnóstico de salud</Text>
        <View style={styles.kpiRow}>
          <KpiCard
            rowVariant
            label="Score de salud"
            value={score === null ? "—" : numero(score, 0)}
            unit={score === null ? undefined : "/ 100"}
            accent
          />
          <KpiCard rowVariant label="Estado" value={estadoSalud} />
          <KpiCard
            rowVariant
            label="NDVI promedio"
            value={numero(ndviPromedio, 3)}
          />
        </View>

        {/* Contenedor dual: vista satelital + raster NDVI */}
        <Text style={{ ...styles.subLabel, marginTop: 22 }}>
          Imagen satelital e índice de vegetación
        </Text>
        <View style={styles.imageRow}>
          <ImagePanel title="Vista satelital" src={mapaLoteBase64} />
          <ImagePanel title="Índice NDVI (Sentinel-2)" src={rasterNdviUrl} />
        </View>

        <Footer />
      </Page>

      {/* ───────────────── PÁGINA 2 · Analítica temporal y riesgos ─────── */}
      <Page size="A4" style={styles.page}>
        <Text style={styles.sectionTitle}>
          3. Evolución del vigor vegetal (NDVI)
        </Text>
        {serieNdvi.length > 0 ? (
          <View style={styles.chartBox}>
            <NdviChartSvg serie={serieNdvi} />
          </View>
        ) : (
          <View style={{ ...styles.placeholderBox, height: 220 }}>
            <Text style={styles.placeholderText}>
              Sin datos de evolución NDVI disponibles (posible cobertura nubosa
              total).
            </Text>
          </View>
        )}

        <Text style={styles.sectionTitle}>4. Historial de alertas</Text>

        {/* Hídrico */}
        <Text style={styles.subLabel}>Eventos de inundación (hídrico)</Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.th, width: colHidrico.inicio }}>
              Inicio
            </Text>
            <Text style={{ ...styles.th, width: colHidrico.fin }}>Fin</Text>
            <Text style={{ ...styles.th, width: colHidrico.duracion }}>
              Duración
            </Text>
          </View>
          {inundaciones.length === 0 ? (
            <EmptyTableRow message="Sin registros detectados" />
          ) : (
            inundaciones.map((ev, i) => (
              <View
                key={`flood-${i}`}
                style={i % 2 === 1 ? styles.tableRowZebra : styles.tableRow}
              >
                <Text style={{ ...styles.td, width: colHidrico.inicio }}>
                  {fechaCorta(ev.began)}
                </Text>
                <Text style={{ ...styles.td, width: colHidrico.fin }}>
                  {fechaCorta(ev.ended)}
                </Text>
                <Text style={{ ...styles.td, width: colHidrico.duracion }}>
                  {ev.duracionDias === null
                    ? "—"
                    : `${numero(ev.duracionDias, 0)} día${ev.duracionDias === 1 ? "" : "s"}`}
                </Text>
              </View>
            ))
          )}
        </View>

        {/* Térmico */}
        <Text style={{ ...styles.subLabel, marginTop: 14 }}>
          Focos de calor detectados (térmico)
        </Text>
        <View style={styles.table}>
          <View style={styles.tableHeader}>
            <Text style={{ ...styles.th, width: colTermico.fecha }}>Fecha</Text>
            <Text style={{ ...styles.th, width: colTermico.confianza }}>
              Confianza
            </Text>
            <Text style={{ ...styles.th, width: colTermico.frp }}>
              FRP máx (MW)
            </Text>
            <Text style={{ ...styles.th, width: colTermico.satelite }}>
              Satélite
            </Text>
          </View>
          {focos.length === 0 ? (
            <EmptyTableRow message="Sin registros detectados" />
          ) : (
            focos.map((foco, i) => (
              <View
                key={`fire-${i}`}
                style={i % 2 === 1 ? styles.tableRowZebra : styles.tableRow}
              >
                <Text style={{ ...styles.td, width: colTermico.fecha }}>
                  {fechaCorta(foco.fecha)}
                </Text>
                <Text style={{ ...styles.td, width: colTermico.confianza }}>
                  {foco.confianza}
                </Text>
                <Text style={{ ...styles.td, width: colTermico.frp }}>
                  {numero(foco.frpMax, 1)}
                </Text>
                <Text style={{ ...styles.td, width: colTermico.satelite }}>
                  {foco.satelites || "—"}
                </Text>
              </View>
            ))
          )}
        </View>

        <Footer />
      </Page>
    </Document>
  );
}

/* ──────────────────── Botón de descarga (Radix + PDF) ──────────────────── */

/**
 * Envoltura `forwardRef` sobre `PDFDownloadLink`: permite que Radix `Button`
 * con `asChild` (Slot) clone el ancla y le inyecte su estética premium sin
 * disparar el warning de "function components cannot be given refs".
 */
const ForwardedPDFLink = forwardRef<
  HTMLAnchorElement,
  ComponentProps<typeof PDFDownloadLink>
>(function ForwardedPDFLink(props) {
  return <PDFDownloadLink {...props} />;
});

export const slugify = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase() || "lote";

/**
 * Genera el PDF del reporte como `Blob` de forma programática (sin click del
 * usuario). Lo usa el flujo "Exportar Reporte PDF" para, en una sola pasada,
 * disparar la descarga local y subir el binario al historial (Supabase Storage).
 *
 * Vive acá (y no en el servicio) para que `@react-pdf/renderer` siga siendo
 * client-only y code-split: el consumidor lo importa dinámicamente al hacer click.
 */
export async function generateReporteBlob(
  data: LoteReporteData,
): Promise<Blob> {
  return pdf(<LoteReportePDF data={data} />).toBlob();
}

export function LoteReporteDownloadLink({
  data,
  fileName,
}: {
  data: LoteReporteData;
  fileName?: string;
}): ReactElement {
  const file =
    fileName ??
    `reporte-${slugify(data.loteNombre)}-${data.generadoEn
      .toISOString()
      .slice(0, 10)}.pdf`;

  return (
    <Button asChild variant="soft" color="jade" size="2">
      <ForwardedPDFLink document={<LoteReportePDF data={data} />} fileName={file}>
        {({ loading, error }) => (
          <>
            {loading ? (
              <Loader2 size={16} className="animate-spin" aria-hidden />
            ) : (
              <FileDown size={16} aria-hidden />
            )}
            {loading
              ? "Preparando documento…"
              : error
                ? "Error al generar"
                : "Descargar Reporte PDF"}
          </>
        )}
      </ForwardedPDFLink>
    </Button>
  );
}
