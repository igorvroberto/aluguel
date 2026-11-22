export const DESTINATION = {
  name: "R. Dr. Emílio Ribas, 89",
  fullAddress: "R. Dr. Emílio Ribas, 89 - Perdizes, São Paulo - SP, 05006-020",
  lat: -23.53231,
  lng: -46.66692,
} as const;

export const STORAGE_KEY = "perdizes-radar-apartments";

export const DEFAULT_MAX_PACKAGE = 4000;

export const GRADE_THRESHOLDS = {
  green: 4,
  yellow: 7,
} as const;

export const TOPOGRAPHY_THRESHOLDS = {
  flatGain: 12,
  moderateGain: 28,
  flatGrade: 4,
  moderateGrade: 7,
} as const;

export const SAMPLE_INTERVAL_METERS = 25;

export const TRANSIT_STATIONS = [
  {
    id: "barra-funda",
    name: "Palmeiras-Barra Funda",
    line: "Linha 3-Vermelha / CPTM",
    color: "#E30613",
    lng: -46.6675,
    lat: -23.5255,
  },
  {
    id: "perdizes-l6",
    name: "Perdizes",
    line: "Linha 6-Laranja",
    color: "#FF6600",
    lng: -46.6752,
    lat: -23.5348,
  },
  {
    id: "clinicas",
    name: "Clínicas",
    line: "Linha 2-Verde",
    color: "#007A5E",
    lng: -46.6702,
    lat: -23.5502,
  },
] as const;

/** Approximate corridor centerlines near Perdizes for overlay. */
export const BUS_CORRIDORS = [
  {
    id: "pacaembu",
    name: "Av. Pacaembu",
    lines: ["875P-10", "208M-10"],
    coordinates: [
      [-46.6628, -23.5205],
      [-46.6615, -23.5285],
      [-46.6602, -23.5365],
      [-46.6588, -23.5445],
    ] as [number, number][],
  },
  {
    id: "turiassu",
    name: "R. Turiassu",
    lines: ["175P-10", "874T-10"],
    coordinates: [
      [-46.6825, -23.5258],
      [-46.6785, -23.5282],
      [-46.6745, -23.5305],
      [-46.6705, -23.5328],
    ] as [number, number][],
  },
  {
    id: "candido",
    name: "R. Dr. Cândido Espinheira",
    lines: ["875P-10", "175P-10"],
    coordinates: [
      [-46.6788, -23.5315],
      [-46.6745, -23.5335],
      [-46.6702, -23.5355],
      [-46.6658, -23.5375],
    ] as [number, number][],
  },
  {
    id: "cardoso",
    name: "R. Cardoso de Almeida",
    lines: ["208M-10", "874T-10"],
    coordinates: [
      [-46.6845, -23.5335],
      [-46.6795, -23.5355],
      [-46.6745, -23.5375],
      [-46.6695, -23.5395],
    ] as [number, number][],
  },
] as const;

export const MAPBOX_STYLE = "mapbox://styles/mapbox/outdoors-v12";
