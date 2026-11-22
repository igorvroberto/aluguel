import type { TopographyClass } from "./types";

export function monthlyPackage(aluguel: number, condominio: number, iptu: number): number {
  return aluguel + condominio + iptu;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

export function formatElevation(meters: number): string {
  return `${Math.round(meters)} m`;
}

export function topographyBadgeClass(topo: TopographyClass): string {
  switch (topo) {
    case "Plano":
      return "bg-emerald-100 text-emerald-800 border-emerald-200";
    case "Inclinação Moderada":
      return "bg-amber-100 text-amber-900 border-amber-200";
    case "Ladeira Íngreme":
      return "bg-rose-100 text-rose-800 border-rose-200";
  }
}

export function gradeColor(grade: number): string {
  const abs = Math.abs(grade);
  if (abs < 4) return "#16a34a";
  if (abs <= 7) return "#ca8a04";
  return "#e11d48";
}
