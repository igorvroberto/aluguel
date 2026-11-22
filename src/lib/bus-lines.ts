/** Itinerários aproximados saindo do Terminal Palmeiras–Barra Funda. */

export interface BusLineDef {
  id: string;
  code: string;
  name: string;
  itinerary: string;
  color: string;
  /** Mapbox line-offset in px — parallel tracks without overlap */
  offset: number;
  coordinates: [number, number][];
}

/** Terminal / Estação Palmeiras–Barra Funda */
export const BARRA_FUNDA: [number, number] = [-46.6675, -23.5255];

export const BUS_LINES: BusLineDef[] = [
  {
    id: "875P-10",
    code: "875P-10",
    name: "Barra Funda ↔ Metrô Ana Rosa",
    itinerary: "Av. Francisco Matarazzo → Rua Turiassu → Rua Dr. Cândido Espinheira",
    color: "#2563EB",
    offset: -4,
    coordinates: [
      BARRA_FUNDA,
      [-46.6702, -23.5272],
      [-46.6735, -23.5288],
      [-46.6768, -23.5302],
      [-46.6752, -23.5318],
      [-46.6725, -23.5335],
      [-46.6698, -23.5352],
      [-46.6665, -23.5368],
      [-46.6632, -23.5385],
      [-46.6598, -23.5425],
      [-46.6555, -23.5485],
      [-46.6485, -23.5555],
    ],
  },
  {
    id: "175P-10",
    code: "175P-10",
    name: "Metrô Santana ↔ Ana Rosa via Barra Funda",
    itinerary: "Av. Pacaembu → Higienópolis → eixo Ana Rosa",
    color: "#EA580C",
    offset: -1.5,
    coordinates: [
      BARRA_FUNDA,
      [-46.6655, -23.5268],
      [-46.6638, -23.5285],
      [-46.6622, -23.5315],
      [-46.6610, -23.5355],
      [-46.6598, -23.5395],
      [-46.6585, -23.5435],
      [-46.6565, -23.5485],
      [-46.6525, -23.5535],
      [-46.6480, -23.5585],
    ],
  },
  {
    id: "208M-10",
    code: "208M-10",
    name: "Metrô Santana ↔ Terminal Pinheiros via Barra Funda",
    itinerary: "Av. Francisco Matarazzo → Av. Sumaré → Pinheiros",
    color: "#059669",
    offset: 1.5,
    coordinates: [
      BARRA_FUNDA,
      [-46.6705, -23.5275],
      [-46.6745, -23.5295],
      [-46.6785, -23.5315],
      [-46.6825, -23.5345],
      [-46.6855, -23.5385],
      [-46.6875, -23.5435],
      [-46.6895, -23.5485],
      [-46.6915, -23.5535],
      [-46.6935, -23.5585],
    ],
  },
  {
    id: "6232-10",
    code: "6232-10",
    name: "Metrô Barra Funda ↔ Pinheiros / Vila Ida",
    itinerary: "Perdizes → Rua Cardoso de Almeida → Pinheiros",
    color: "#7C3AED",
    offset: 4,
    coordinates: [
      BARRA_FUNDA,
      [-46.6695, -23.5285],
      [-46.6725, -23.5315],
      [-46.6755, -23.5345],
      [-46.6785, -23.5365],
      [-46.6815, -23.5385],
      [-46.6845, -23.5405],
      [-46.6875, -23.5445],
      [-46.6905, -23.5495],
      [-46.6935, -23.5545],
    ],
  },
];

export const BUS_LINE_WIDTH = 2.5;

export function buildBusLinesGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: BUS_LINES.map((line) => ({
      type: "Feature" as const,
      properties: {
        id: line.id,
        code: line.code,
        name: line.name,
        itinerary: line.itinerary,
        color: line.color,
        offset: line.offset,
      },
      geometry: {
        type: "LineString" as const,
        coordinates: line.coordinates,
      },
    })),
  };
}
