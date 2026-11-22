import { monthlyPackage } from "./format";
import type { Apartment, RouteAnalysis } from "./types";

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
  elevationGain: number | null;
  maxGrade: number | null;
  topography: string | null;
  notes: string | null;
}

export function buildExportRows(
  apartments: Apartment[],
  analyses: Record<string, RouteAnalysis>
): ExportRow[] {
  return apartments.map((apt) => {
    const a = analyses[apt.id];
    return {
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
      distanceMeters: a ? Math.round(a.distanceMeters) : null,
      elevationGain: a ? Math.round(a.elevationGain * 10) / 10 : null,
      maxGrade: a ? Math.round(Math.abs(a.maxGrade) * 10) / 10 : null,
      topography: a?.topography ?? null,
      notes: apt.notes ?? null,
    };
  });
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
    "elevationGain",
    "maxGrade",
    "topography",
    "notes",
  ];

  const lines = [
    headers.join(";"),
    ...rows.map((row) => headers.map((h) => csvEscape(row[h])).join(";")),
  ];
  // BOM for Excel
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
