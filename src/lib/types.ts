export type SortOption = "pacote" | "distancia";

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

export type TripDirection = "ida" | "volta";

export interface FiltersState {
  /** Pacote mensal mínimo (null = sem mínimo). */
  minPackage: number | null;
  /** Pacote mensal máximo (null = sem máximo). */
  maxPackage: number | null;
  rooms: Array<1 | 2 | 3>;
  /** Vagas de carro: 0, 1 ou 2+ (2). */
  parkingSpots: Array<0 | 1 | 2>;
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
