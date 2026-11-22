/**
 * Linhas de ônibus que passam perto da Faculdade Santa Marcelina (Perdizes)
 * e dos corredores onde costumam ficar os imóveis analisados.
 */

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

/** Faculdade Santa Marcelina / R. Dr. Emílio Ribas, 89 */
export const FACULDADE: [number, number] = [-46.6654622, -23.5363756];

export const BUS_LINES: BusLineDef[] = [
  {
    id: "875P-10",
    code: "875P-10",
    name: "Pompéia / Perdizes ↔ Ana Rosa",
    itinerary:
      "R. Turiassu → R. Dr. Cândido Espinheira → proximidade Emílio Ribas → eixo sul",
    color: "#2563EB",
    offset: -4,
    coordinates: [
      [-46.6785, -23.5285],
      [-46.6752, -23.5305],
      [-46.6725, -23.5318],
      FACULDADE,
      [-46.6635, -23.5345],
      [-46.6585, -23.5405],
      [-46.6525, -23.5485],
      [-46.6485, -23.5555],
    ],
  },
  {
    id: "175P-10",
    code: "175P-10",
    name: "Pacaembu / Higienópolis ↔ Ana Rosa",
    itinerary: "Av. Pacaembu → proximidade faculdade → Higienópolis → Ana Rosa",
    color: "#EA580C",
    offset: -1.5,
    coordinates: [
      [-46.6625, -23.5225],
      [-46.6615, -23.5285],
      [-46.6605, -23.5315],
      FACULDADE,
      [-46.6585, -23.5385],
      [-46.6545, -23.5485],
      [-46.6480, -23.5585],
    ],
  },
  {
    id: "208M-10",
    code: "208M-10",
    name: "Sumaré / Perdizes ↔ Pinheiros",
    itinerary: "Av. Sumaré → Cardoso de Almeida → proximidade Perdizes → Pinheiros",
    color: "#059669",
    offset: 1.5,
    coordinates: [
      [-46.6725, -23.5225],
      [-46.6705, -23.5285],
      FACULDADE,
      [-46.6745, -23.5365],
      [-46.6825, -23.5425],
      [-46.6895, -23.5505],
      [-46.6935, -23.5585],
    ],
  },
  {
    id: "6232-10",
    code: "6232-10",
    name: "Perdizes ↔ Pinheiros / Vila Ida",
    itinerary:
      "R. Cardoso de Almeida → corredor Perdizes (perto da faculdade) → Pinheiros",
    color: "#7C3AED",
    offset: 4,
    coordinates: [
      [-46.6785, -23.5285],
      [-46.6745, -23.5305],
      FACULDADE,
      [-46.6705, -23.5345],
      [-46.6785, -23.5385],
      [-46.6865, -23.5465],
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
