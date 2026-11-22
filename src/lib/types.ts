export type TopographyClass = "Plano" | "Inclinação Moderada" | "Ladeira Íngreme";

export type SortOption = "pacote" | "distancia" | "subida";

export type ApartmentStatus =
  | "Candidato"
  | "Favorito"
  | "Visita Agendada"
  | "Descartado";

export const APARTMENT_STATUSES: ApartmentStatus[] = [
  "Candidato",
  "Favorito",
  "Visita Agendada",
  "Descartado",
];

export interface Apartment {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  rooms: number;
  aluguel: number;
  condominio: number;
  iptu: number;
  portaria24h: boolean;
  externalUrl: string;
  areaM2?: number;
  parkingSpots?: number;
  notes?: string;
  status?: ApartmentStatus;
  comments?: string;
  source?: string;
  scrapedAt?: string;
}

export type TravelMode = "walk" | "transit";

export interface ElevationPoint {
  distance: number;
  elevation: number;
  lng: number;
  lat: number;
  grade: number;
}

export interface RouteAnalysis {
  apartmentId: string;
  distanceMeters: number;
  elevationGain: number;
  maxGrade: number;
  topography: TopographyClass;
  coordinates: [number, number][];
  elevationProfile: ElevationPoint[];
  segmentGrades: number[];
}

export interface FiltersState {
  maxPackage: number;
  rooms: Array<1 | 2 | 3>;
  onlyFlat: boolean;
  portaria24h: boolean;
  sortBy: SortOption;
  stationIds: string[];
  stationRadiusMeters: number;
  statuses: ApartmentStatus[];
}

export interface NewApartmentInput {
  title: string;
  address: string;
  lat: number;
  lng: number;
  rooms: number;
  aluguel: number;
  condominio: number;
  iptu: number;
  portaria24h: boolean;
  externalUrl: string;
  areaM2?: number;
  parkingSpots?: number;
  notes?: string;
  status?: ApartmentStatus;
  comments?: string;
  source?: string;
}
