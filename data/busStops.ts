/**
 * Paradas reais perto da Faculdade Santa Marcelina / corredores das linhas.
 * Coords alinhadas a endereços usados no Google Maps / Moovit (não são
 * vértices inventados do traçado aproximado em bus-lines.ts).
 */
export interface BusStopDef {
  id: string;
  /** Nome como no Maps, ex.: "R. Cardoso de Almeida, 414" */
  name: string;
  lat: number;
  lng: number;
  /** Linhas SPTrans que passam (ou passam perto) nesta parada */
  lines: string[];
}

export const BUS_STOPS: BusStopDef[] = [
  // Mais próximas da Emílio Ribas, 89
  {
    id: "cardoso-414",
    name: "R. Cardoso de Almeida, 414",
    lat: -23.5349019,
    lng: -46.666287,
    lines: ["175P-10", "875P-10", "975A-10"],
  },
  {
    id: "turiassu-241",
    name: "R. Turiassú, 241",
    lat: -23.5339466,
    lng: -46.6654982,
    lines: ["875P-10"],
  },
  {
    id: "pacaembu-1403",
    name: "Av. Pacaembu, 1403",
    lat: -23.5388065,
    lng: -46.6638242,
    lines: ["175P-10"],
  },
  {
    id: "itapicuru-471",
    name: "R. Itapicuru, 471",
    lat: -23.535278,
    lng: -46.6685263,
    lines: ["875A-10"],
  },
  {
    id: "homem-melo-450",
    name: "R. Dr. Homem de Melo, 450",
    lat: -23.5366486,
    lng: -46.6690757,
    lines: ["875A-10"],
  },
  {
    id: "homem-melo-574",
    name: "R. Dr. Homem de Melo, 574",
    lat: -23.5359762,
    lng: -46.6700188,
    lines: ["875A-10"],
  },
  {
    id: "cardoso-848",
    name: "R. Cardoso de Almeida, 848",
    lat: -23.5381205,
    lng: -46.6685487,
    lines: ["175P-10", "875P-10", "975A-10"],
  },
  {
    id: "cardoso-945",
    name: "R. Cardoso de Almeida, 945",
    lat: -23.5389196,
    lng: -46.6691091,
    lines: ["175P-10", "875P-10", "975A-10"],
  },
  {
    id: "sumare-753",
    name: "Av. Sumaré, 753",
    lat: -23.536201,
    lng: -46.6741352,
    lines: ["208M-10", "6232-10", "875H-10"],
  },
  {
    id: "joao-ramalho-951",
    name: "R. João Ramalho, 951",
    lat: -23.5347172,
    lng: -46.6749051,
    lines: ["875A-10"],
  },
  // Corredor / extremos úteis para imóveis mais longe
  {
    id: "turiassu-parada-traipu",
    name: "Parada Traipu (R. Turiassú)",
    lat: -23.5345101,
    lng: -46.6643857,
    lines: ["875P-10"],
  },
  {
    id: "turiassu-parada-parque",
    name: "Parada Parque Fernando Costa (R. Turiassú)",
    lat: -23.5327296,
    lng: -46.6711758,
    lines: ["875P-10"],
  },
  {
    id: "caiubi-1061",
    name: "R. Caiubi, 1061",
    lat: -23.53679,
    lng: -46.67736,
    lines: ["7267-10"],
  },
  {
    id: "sumare-73",
    name: "Av. Sumaré, 73",
    lat: -23.53052,
    lng: -46.67712,
    lines: ["208M-10", "6232-10"],
  },
];

export function buildBusStopsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: BUS_STOPS.map((stop) => ({
      type: "Feature" as const,
      properties: {
        id: stop.id,
        name: stop.name,
        lines: stop.lines.join(", "),
      },
      geometry: {
        type: "Point" as const,
        coordinates: [stop.lng, stop.lat],
      },
    })),
  };
}
