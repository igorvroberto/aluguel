export function monthlyPackage(aluguel: number, condominio: number, iptu: number): number {
  return aluguel + condominio + iptu;
}

export function formatBRL(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/** Inteiro com separador de milhar (pt-BR), ex.: 4000 → "4.000". */
export function formatThousands(value: number): string {
  return new Intl.NumberFormat("pt-BR", {
    maximumFractionDigits: 0,
  }).format(value);
}

/** Parseia "4.000" / "4000" / "R$ 4.000,00" → número. */
export function parseThousandsInput(raw: string): number | null {
  const cleaned = raw
    .replace(/R\$\s?/gi, "")
    .replace(/\./g, "")
    .replace(/,/g, ".")
    .trim();
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")} km`;
}

/** Distância sempre em Km (pt-BR), ex.: 994 → "0,99 Km". */
export function formatDistanceKm(meters: number): string {
  const km = meters / 1000;
  const digits = km < 10 ? 2 : 1;
  return `${km.toFixed(digits).replace(".", ",")} Km`;
}
