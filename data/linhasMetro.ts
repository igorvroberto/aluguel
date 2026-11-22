/** Estações oficiais das linhas 3-Vermelha e 6-Laranja (trecho ativo). */

export type MetroLineId = "l3" | "l6";

export interface MetroStation {
  id: string;
  name: string;
  line: MetroLineId;
  /** Código curto no badge: L3 / L6 */
  lineCode: "L3" | "L6";
  color: string;
  /** Ordem ao longo do traçado. */
  order: number;
  lat: number;
  lng: number;
  integration?: string;
  /** Linha 6: só estações do trecho em operação. */
  ativa?: boolean;
  /** Destaque no filtro (próximas ao destino Emílio Ribas). */
  highlight?: boolean;
}

export const LINHA_VERMELHA_COLOR = "#EE352E";
export const LINHA_LARANJA_COLOR = "#FF6B00";

export const LINHA_VERMELHA: MetroStation[] = [
  {
    id: "l3-barra-funda",
    name: "Palmeiras–Barra Funda",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 1,
    lat: -23.5255,
    lng: -46.6674,
    integration: "CPTM Linhas 7 e 8",
  },
  {
    id: "l3-marechal-deodoro",
    name: "Marechal Deodoro",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 2,
    lat: -23.5338,
    lng: -46.6559,
  },
  {
    id: "l3-santa-cecilia",
    name: "Santa Cecília",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 3,
    lat: -23.5382,
    lng: -46.6494,
  },
  {
    id: "l3-republica",
    name: "República",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 4,
    lat: -23.5439,
    lng: -46.6427,
    integration: "Linha 4-Amarela",
  },
  {
    id: "l3-anhangabau",
    name: "Anhangabaú",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 5,
    lat: -23.5478,
    lng: -46.6393,
  },
  {
    id: "l3-se",
    name: "Sé",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 6,
    lat: -23.5503,
    lng: -46.6342,
    integration: "Linha 1-Azul",
  },
  {
    id: "l3-pedro-ii",
    name: "Pedro II",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 7,
    lat: -23.5498,
    lng: -46.6258,
  },
  {
    id: "l3-bras",
    name: "Brás",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 8,
    lat: -23.5453,
    lng: -46.6163,
    integration: "CPTM Linhas 10, 11, 12 e 13",
  },
  {
    id: "l3-bresser-mooca",
    name: "Bresser–Mooca",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 9,
    lat: -23.5464,
    lng: -46.6072,
  },
  {
    id: "l3-belem",
    name: "Belém",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 10,
    lat: -23.5433,
    lng: -46.5896,
  },
  {
    id: "l3-tatuape",
    name: "Tatuapé",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 11,
    lat: -23.5402,
    lng: -46.5766,
    integration: "CPTM Linhas 11 e 12",
  },
  {
    id: "l3-carrao",
    name: "Carrão–Assaí Atacadista",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 12,
    lat: -23.5378,
    lng: -46.5641,
  },
  {
    id: "l3-penha",
    name: "Penha–Lojas Besni",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 13,
    lat: -23.5335,
    lng: -46.5425,
  },
  {
    id: "l3-vila-matilde",
    name: "Vila Matilde",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 14,
    lat: -23.5318,
    lng: -46.5308,
  },
  {
    id: "l3-guilhermina",
    name: "Guilhermina–Esperança",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 15,
    lat: -23.5293,
    lng: -46.5167,
  },
  {
    id: "l3-patriarca",
    name: "Patriarca–Vila Ré",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 16,
    lat: -23.5312,
    lng: -46.5015,
  },
  {
    id: "l3-artur-alvim",
    name: "Artur Alvim",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 17,
    lat: -23.5404,
    lng: -46.4846,
  },
  {
    id: "l3-itaquera",
    name: "Corinthians–Itaquera",
    line: "l3",
    lineCode: "L3",
    color: LINHA_VERMELHA_COLOR,
    order: 18,
    lat: -23.5422,
    lng: -46.4711,
    integration: "CPTM Linha 11-Coral",
  },
];

/**
 * Trecho Norte–Oeste ativo da Linha 6-Laranja.
 * Numeração a partir de Perdizes (perto da faculdade) rumo ao norte.
 * Brasilândia / Vila Cardoso / Itaberaba ainda não estão em operação.
 */
export const LINHA_LARANJA_ATIVAS: MetroStation[] = [
  {
    id: "l6-perdizes",
    name: "Perdizes",
    line: "l6",
    lineCode: "L6",
    color: LINHA_LARANJA_COLOR,
    order: 1,
    lat: -23.5385,
    lng: -46.6738,
    integration: "Acesso próximo à Faculdade Santa Marcelina (R. Dr. Emílio Ribas, 89)",
    ativa: true,
    highlight: true,
  },
  {
    id: "l6-sesc-pompeia",
    name: "SESC-Pompéia",
    line: "l6",
    lineCode: "L6",
    color: LINHA_LARANJA_COLOR,
    order: 2,
    lat: -23.5276,
    lng: -46.6808,
    ativa: true,
    highlight: true,
  },
  {
    id: "l6-agua-branca",
    name: "Água Branca",
    line: "l6",
    lineCode: "L6",
    color: LINHA_LARANJA_COLOR,
    order: 3,
    lat: -23.5222,
    lng: -46.6845,
    integration: "CPTM Linhas 7 e 8",
    ativa: true,
    highlight: true,
  },
  {
    id: "l6-santa-marina",
    name: "Santa Marina",
    line: "l6",
    lineCode: "L6",
    color: LINHA_LARANJA_COLOR,
    order: 4,
    lat: -23.5168,
    lng: -46.6894,
    ativa: true,
  },
  {
    id: "l6-freguesia-do-o",
    name: "Freguesia do Ó",
    line: "l6",
    lineCode: "L6",
    color: LINHA_LARANJA_COLOR,
    order: 5,
    lat: -23.5098,
    lng: -46.6961,
    ativa: true,
  },
  {
    id: "l6-joao-paulo-i",
    name: "João Paulo I",
    line: "l6",
    lineCode: "L6",
    color: LINHA_LARANJA_COLOR,
    order: 6,
    lat: -23.5015,
    lng: -46.6978,
    ativa: true,
  },
];

/** Todas as estações usadas em proximidade / mapa / filtro. */
export const METRO_STATIONS: MetroStation[] = [
  ...LINHA_VERMELHA,
  ...LINHA_LARANJA_ATIVAS,
];

/** Trecho oeste/centro L3: Barra Funda → República. */
export const LINHA_VERMELHA_WEST_CENTER_IDS = LINHA_VERMELHA.filter(
  (s) => s.order >= 1 && s.order <= 4
).map((s) => s.id);

export const STATION_RADIUS_OPTIONS = [
  { value: 500, label: "500 m" },
  { value: 800, label: "800 m" },
  { value: 1200, label: "1,2 km" },
] as const;

export const DEFAULT_STATION_RADIUS_METERS = 800;

export function getMetroStation(id: string): MetroStation | undefined {
  return METRO_STATIONS.find((s) => s.id === id);
}

/** L6 no filtro: ordem numérica (1 Perdizes → 6 João Paulo I). */
export function sortLinhaLaranjaForFilter(
  stations: MetroStation[]
): MetroStation[] {
  return [...stations].sort((a, b) => a.order - b.order);
}
