import type { Apartment, NewApartmentInput } from "./types";

export interface ApartmentsApiMeta {
  persisted?: boolean;
  persistError?: string;
  added?: number;
  skipped?: number;
}

async function parseJson<T>(res: Response): Promise<T & { ok?: boolean; error?: string }> {
  const data = (await res.json()) as T & { ok?: boolean; error?: string };
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export async function fetchApartments(): Promise<Apartment[]> {
  const res = await fetch("/api/apartments", { cache: "no-store" });
  const data = await parseJson<{ apartments: Apartment[] }>(res);
  return data.apartments ?? [];
}

export async function createApartments(
  inputs: NewApartmentInput[] | NewApartmentInput
): Promise<{ apartments: Apartment[]; meta: ApartmentsApiMeta }> {
  const list = Array.isArray(inputs) ? inputs : [inputs];
  const res = await fetch("/api/apartments", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ apartments: list }),
  });
  const data = await parseJson<{
    apartments: Apartment[];
    added?: Apartment[];
    skipped?: number;
    persisted?: boolean;
    persistError?: string;
  }>(res);
  if (data.persisted === false) {
    throw new Error(
      data.persistError
        ? `Não foi possível gravar no servidor: ${data.persistError}`
        : "Não foi possível gravar no servidor (disco somente leitura)."
    );
  }

  return {
    apartments: data.apartments,
    meta: {
      persisted: data.persisted,
      persistError: data.persistError,
      added: data.added?.length ?? 0,
      skipped: data.skipped,
    },
  };
}

export async function patchApartment(
  id: string,
  patch: Partial<Apartment>
): Promise<{ apartment: Apartment; meta: ApartmentsApiMeta }> {
  const res = await fetch("/api/apartments", {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, patch }),
  });
  const data = await parseJson<{
    apartment: Apartment;
    persisted?: boolean;
    persistError?: string;
  }>(res);
  return {
    apartment: data.apartment,
    meta: {
      persisted: data.persisted,
      persistError: data.persistError,
    },
  };
}

export async function removeApartment(
  id: string
): Promise<{ meta: ApartmentsApiMeta }> {
  const res = await fetch("/api/apartments", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await parseJson<{
    persisted?: boolean;
    persistError?: string;
  }>(res);
  return {
    meta: {
      persisted: data.persisted,
      persistError: data.persistError,
    },
  };
}

/** Baixa o JSON atual do servidor (útil quando o FS é read-only e o cache está só em memória). */
export async function downloadApartmentsJsonFile(): Promise<void> {
  const apartments = await fetchApartments();
  const stamp = new Date().toISOString().slice(0, 10);
  const blob = new Blob([`${JSON.stringify(apartments, null, 2)}\n`], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `apartments-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface ScrapeStationsRequest {
  stationIds: string[];
  radiusMeters: number;
  maxPackage: number;
  rooms: Array<1 | 2 | 3>;
}

export interface ScrapeStationsResult {
  ok: boolean;
  apartments: Apartment[];
  added: number;
  skipped: number;
  scanned: number;
  portals: string[];
  warnings: string[];
  persisted?: boolean;
  persistError?: string;
  message?: string;
  error?: string;
}

export async function scrapeStations(
  body: ScrapeStationsRequest
): Promise<ScrapeStationsResult> {
  const res = await fetch("/api/scrape-stations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = (await res.json()) as ScrapeStationsResult;
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}

export interface ScrapeTermometroResult {
  ok: boolean;
  apartments: Apartment[];
  added: number;
  skipped: number;
  scanned: number;
  requests?: number;
  portals: string[];
  warnings: string[];
  persisted?: boolean;
  persistError?: string;
  message?: string;
  error?: string;
}

/** Importa anúncios via API pública do Termômetro (sem Playwright/Cloudflare). */
export async function scrapeTermometro(body?: {
  raio?: number;
  custoMax?: number;
  quartosMin?: number;
  vagasMin?: number;
}): Promise<ScrapeTermometroResult> {
  const res = await fetch("/api/scrape-termometro", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body ?? {}),
  });
  const data = (await res.json()) as ScrapeTermometroResult;
  if (!res.ok || data.ok === false) {
    throw new Error(data.error || `HTTP ${res.status}`);
  }
  return data;
}
