/**
 * Estilos de @mapbox/mapbox-gl-draw compatibles con MapLibre GL 5.x.
 * Los arrays en line-dasharray deben usar ["literal", [...]] (ver mapbox/mapbox-gl-draw#1504).
 *
 * No son LayerSpecification de MapLibre: Draw inyecta el source al registrar las capas.
 */
const blue = "#3bb2d0";
const orange = "#fbb03b";
const white = "#fff";

export const mapDrawStyles: object[] = [
  {
    id: "gl-draw-polygon-fill",
    type: "fill",
    filter: ["all", ["==", "$type", "Polygon"]],
    paint: {
      "fill-color": [
        "case",
        ["==", ["get", "active"], "true"],
        orange,
        blue,
      ],
      "fill-opacity": 0.1,
    },
  },
  {
    id: "gl-draw-lines",
    type: "line",
    filter: [
      "any",
      ["==", "$type", "LineString"],
      ["==", "$type", "Polygon"],
    ],
    layout: {
      "line-cap": "round",
      "line-join": "round",
    },
    paint: {
      "line-color": [
        "case",
        ["==", ["get", "active"], "true"],
        orange,
        blue,
      ],
      "line-dasharray": [
        "case",
        ["==", ["get", "active"], "true"],
        ["literal", [0.2, 2]],
        ["literal", [2, 0]],
      ],
      "line-width": 2,
    },
  },
  {
    id: "gl-draw-point-outer",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "active"], "true"],
        7,
        5,
      ],
      "circle-color": white,
    },
  },
  {
    id: "gl-draw-point-inner",
    type: "circle",
    filter: ["all", ["==", "$type", "Point"], ["==", "meta", "feature"]],
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "active"], "true"],
        5,
        3,
      ],
      "circle-color": [
        "case",
        ["==", ["get", "active"], "true"],
        orange,
        blue,
      ],
    },
  },
  {
    id: "gl-draw-vertex-outer",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "vertex"],
      ["!=", "mode", "simple_select"],
    ],
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "active"], "true"],
        7,
        5,
      ],
      "circle-color": white,
    },
  },
  {
    id: "gl-draw-vertex-inner",
    type: "circle",
    filter: [
      "all",
      ["==", "$type", "Point"],
      ["==", "meta", "vertex"],
      ["!=", "mode", "simple_select"],
    ],
    paint: {
      "circle-radius": [
        "case",
        ["==", ["get", "active"], "true"],
        5,
        3,
      ],
      "circle-color": orange,
    },
  },
  {
    id: "gl-draw-midpoint",
    type: "circle",
    filter: ["all", ["==", "meta", "midpoint"]],
    paint: {
      "circle-radius": 3,
      "circle-color": orange,
    },
  },
];
