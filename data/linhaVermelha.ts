/** 18 estações oficiais da Linha 3-Vermelha (Palmeiras–Barra Funda → Corinthians–Itaquera). */

export const LINHA_VERMELHA_COLOR = "#EE352E";

export interface LinhaVermelhaStation {
  id: string;
  name: string;
  /** Ordem oeste → leste (1–18). */
  order: number;
  lat: number;
  lng: number;
  integration?: string;
}

export const LINHA_VERMELHA: LinhaVermelhaStation[] = [
  {
    id: "l3-barra-funda",
    name: "Palmeiras–Barra Funda",
    order: 1,
    lat: -23.5255,
    lng: -46.6674,
    integration: "CPTM Linhas 7 e 8",
  },
  {
    id: "l3-marechal-deodoro",
    name: "Marechal Deodoro",
    order: 2,
    lat: -23.5338,
    lng: -46.6559,
  },
  {
    id: "l3-santa-cecilia",
    name: "Santa Cecília",
    order: 3,
    lat: -23.5382,
    lng: -46.6494,
  },
  {
    id: "l3-republica",
    name: "República",
    order: 4,
    lat: -23.5439,
    lng: -46.6427,
    integration: "Linha 4-Amarela",
  },
  {
    id: "l3-anhangabau",
    name: "Anhangabaú",
    order: 5,
    lat: -23.5478,
    lng: -46.6393,
  },
  {
    id: "l3-se",
    name: "Sé",
    order: 6,
    lat: -23.5503,
    lng: -46.6342,
    integration: "Linha 1-Azul",
  },
  {
    id: "l3-pedro-ii",
    name: "Pedro II",
    order: 7,
    lat: -23.5498,
    lng: -46.6258,
  },
  {
    id: "l3-bras",
    name: "Brás",
    order: 8,
    lat: -23.5453,
    lng: -46.6163,
    integration: "CPTM Linhas 10, 11, 12 e 13",
  },
  {
    id: "l3-bresser-mooca",
    name: "Bresser–Mooca",
    order: 9,
    lat: -23.5464,
    lng: -46.6072,
  },
  {
    id: "l3-belem",
    name: "Belém",
    order: 10,
    lat: -23.5433,
    lng: -46.5896,
  },
  {
    id: "l3-tatuape",
    name: "Tatuapé",
    order: 11,
    lat: -23.5402,
    lng: -46.5766,
    integration: "CPTM Linhas 11 e 12",
  },
  {
    id: "l3-carrao",
    name: "Carrão–Assaí Atacadista",
    order: 12,
    lat: -23.5378,
    lng: -46.5641,
  },
  {
    id: "l3-penha",
    name: "Penha–Lojas Besni",
    order: 13,
    lat: -23.5335,
    lng: -46.5425,
  },
  {
    id: "l3-vila-matilde",
    name: "Vila Matilde",
    order: 14,
    lat: -23.5318,
    lng: -46.5308,
  },
  {
    id: "l3-guilhermina",
    name: "Guilhermina–Esperança",
    order: 15,
    lat: -23.5293,
    lng: -46.5167,
  },
  {
    id: "l3-patriarca",
    name: "Patriarca–Vila Ré",
    order: 16,
    lat: -23.5312,
    lng: -46.5015,
  },
  {
    id: "l3-artur-alvim",
    name: "Artur Alvim",
    order: 17,
    lat: -23.5404,
    lng: -46.4846,
  },
  {
    id: "l3-itaquera",
    name: "Corinthians–Itaquera",
    order: 18,
    lat: -23.5422,
    lng: -46.4711,
    integration: "CPTM Linha 11-Coral",
  },
];

/** Trecho oeste/centro: Barra Funda → República. */
export const LINHA_VERMELHA_WEST_CENTER_IDS = LINHA_VERMELHA.filter(
  (s) => s.order >= 1 && s.order <= 4
).map((s) => s.id);

export const STATION_RADIUS_OPTIONS = [
  { value: 500, label: "500 m" },
  { value: 800, label: "800 m" },
  { value: 1200, label: "1,2 km" },
] as const;

export const DEFAULT_STATION_RADIUS_METERS = 800;

export function getLinhaVermelhaStation(
  id: string
): LinhaVermelhaStation | undefined {
  return LINHA_VERMELHA.find((s) => s.id === id);
}
