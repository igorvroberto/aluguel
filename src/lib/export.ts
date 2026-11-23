import { DESTINATION } from "./constants";
import { monthlyPackage } from "./format";
import { distanceMeters } from "./geo";
import type { Apartment } from "./types";

export interface ExportRow {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  rooms: number;
  areaM2: number | null;
  parkingSpots: number | null;
  aluguel: number;
  condominio: number;
  iptu: number;
  pacoteMensal: number;
  portaria24h: boolean;
  externalUrl: string;
  distanceMeters: number | null;
  notes: string | null;
}

export function buildExportRows(apartments: Apartment[]): ExportRow[] {
  return apartments.map((apt) => ({
    id: apt.id,
    title: apt.title,
    address: apt.address,
    lat: apt.lat,
    lng: apt.lng,
    rooms: apt.rooms,
    areaM2: apt.areaM2 ?? null,
    parkingSpots: apt.parkingSpots ?? null,
    aluguel: apt.aluguel,
    condominio: apt.condominio,
    iptu: apt.iptu,
    pacoteMensal: monthlyPackage(apt.aluguel, apt.condominio, apt.iptu),
    portaria24h: apt.portaria24h,
    externalUrl: apt.externalUrl,
    distanceMeters: Math.round(distanceMeters(apt, DESTINATION)),
    notes: apt.notes ?? null,
  }));
}

function csvEscape(value: unknown): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(rows: ExportRow[]): string {
  const headers: Array<keyof ExportRow> = [
    "id",
    "title",
    "address",
    "lat",
    "lng",
    "rooms",
    "areaM2",
    "parkingSpots",
    "aluguel",
    "condominio",
    "iptu",
    "pacoteMensal",
    "portaria24h",
    "externalUrl",
    "distanceMeters",
    "notes",
  ];

  const lines = [
    headers.join(";"),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(";")),
  ];
  return `\uFEFF${lines.join("\n")}`;
}

export function downloadBlob(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
