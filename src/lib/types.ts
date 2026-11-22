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
export type TripDirection = "ida" | "volta";

export interface ElevationPoint {
  distance: number;
  elevation: number;
  lng: number;
  lat: number;
  grade: number;
}

/** Um trecho a pé (ida ou volta). Altimetria só deste caminhar. */
export interface WalkLegAnalysis {
  distanceMeters: number;
  durationMinutes: number;
  elevationGain: number;
  maxGrade: number;
  topography: TopographyClass;
  coordinates: [number, number][];
  elevationProfile: ElevationPoint[];
  segmentGrades: number[];
}

export interface RouteAnalysis {
  apartmentId: string;
  /** Ida: imóvel → destino (compat: campos flat espelham a ida). */
  ida: WalkLegAnalysis;
  /** Volta: destino → imóvel. */
  volta: WalkLegAnalysis;
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
