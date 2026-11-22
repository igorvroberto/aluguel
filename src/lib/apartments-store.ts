import { promises as fs } from "fs";
import path from "path";
import type { Apartment, ApartmentStatus } from "./types";

const DEFAULT_STATUS: ApartmentStatus = "Candidato";

function resolveDataPath(): string {
  if (process.env.APARTMENTS_DATA_PATH) {
    return process.env.APARTMENTS_DATA_PATH;
  }
  // Dev: repo root; Docker standalone: /app/data/apartments.json (volume)
  return path.join(process.cwd(), "data", "apartments.json");
}

let memoryCache: Apartment[] | null = null;
let writeLocked = Promise.resolve();

function normalizeApartment(raw: Partial<Apartment>): Apartment {
  return {
    id: String(raw.id ?? `apt-${Date.now()}`),
    title: String(raw.title ?? "Apartamento"),
    address: String(raw.address ?? ""),
    lat: Number(raw.lat),
    lng: Number(raw.lng),
    rooms: Number(raw.rooms ?? 1),
    aluguel: Number(raw.aluguel ?? 0),
    condominio: Number(raw.condominio ?? 0),
    iptu: Number(raw.iptu ?? 0),
    portaria24h: Boolean(raw.portaria24h),
    externalUrl: String(raw.externalUrl ?? ""),
    areaM2: raw.areaM2 != null ? Number(raw.areaM2) : undefined,
    parkingSpots:
      raw.parkingSpots != null ? Number(raw.parkingSpots) : undefined,
    notes: raw.notes != null ? String(raw.notes) : undefined,
    status: (raw.status as ApartmentStatus) || DEFAULT_STATUS,
    comments: raw.comments != null ? String(raw.comments) : undefined,
    source: raw.source != null ? String(raw.source) : undefined,
    scrapedAt: raw.scrapedAt != null ? String(raw.scrapedAt) : undefined,
  };
}

async function readFromDisk(): Promise<Apartment[]> {
  const filePath = resolveDataPath();
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.map((item) =>
      normalizeApartment(item as Partial<Apartment>)
    );
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code;
    if (code === "ENOENT") return [];
    throw err;
  }
}

async function writeToDisk(apartments: Apartment[]): Promise<{ ok: boolean; error?: string }> {
  const filePath = resolveDataPath();
  const payload = `${JSON.stringify(apartments, null, 2)}\n`;
  try {
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, payload, "utf8");
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Serverless / read-only FS — keep memory cache
    return { ok: false, error: message };
  }
}

export function getApartmentsDataPath(): string {
  return resolveDataPath();
}

export async function listApartments(): Promise<Apartment[]> {
  if (!memoryCache) {
    memoryCache = await readFromDisk();
  }
  return memoryCache.map((a) => ({ ...a }));
}

export async function replaceApartments(
  apartments: Apartment[]
): Promise<{ apartments: Apartment[]; persisted: boolean; persistError?: string }> {
  const normalized = apartments.map((a) => normalizeApartment(a));
  memoryCache = normalized;
  const result = await writeToDisk(normalized);
  return {
    apartments: normalized.map((a) => ({ ...a })),
    persisted: result.ok,
    persistError: result.error,
  };
}

export async function withApartmentLock<T>(fn: () => Promise<T>): Promise<T> {
  const run = writeLocked.then(fn, fn);
  writeLocked = run.then(
    () => undefined,
    () => undefined
  );
  return run;
}

export async function addApartments(
  inputs: Array<Partial<Apartment>>,
  opts?: { dedupeByUrl?: boolean }
): Promise<{
  apartments: Apartment[];
  added: Apartment[];
  skipped: number;
  persisted: boolean;
  persistError?: string;
}> {
  return withApartmentLock(async () => {
    const current = await listApartments();
    const byId = new Map(current.map((a) => [a.id, a]));
    const urls = new Set(
      current
        .map((a) => a.externalUrl.trim().toLowerCase())
        .filter(Boolean)
    );
    const addresses = new Set(
      current.map((a) => a.address.trim().toLowerCase()).filter(Boolean)
    );

    const added: Apartment[] = [];
    let skipped = 0;

    for (const input of inputs) {
      const candidate = normalizeApartment({
        ...input,
        id: input.id || `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        status: (input.status as ApartmentStatus) || DEFAULT_STATUS,
      });

      if (!Number.isFinite(candidate.lat) || !Number.isFinite(candidate.lng)) {
        skipped += 1;
        continue;
      }

      if (opts?.dedupeByUrl !== false) {
        const urlKey = candidate.externalUrl.trim().toLowerCase();
        const addrKey = candidate.address.trim().toLowerCase();
        if (urlKey && urls.has(urlKey)) {
          skipped += 1;
          continue;
        }
        if (addrKey && addresses.has(addrKey)) {
          skipped += 1;
          continue;
        }
        if (urlKey) urls.add(urlKey);
        if (addrKey) addresses.add(addrKey);
      }

      byId.set(candidate.id, candidate);
      added.push(candidate);
    }

    const next = Array.from(byId.values());
    const saved = await replaceApartments(next);
    return {
      apartments: saved.apartments,
      added,
      skipped,
      persisted: saved.persisted,
      persistError: saved.persistError,
    };
  });
}

export async function updateApartment(
  id: string,
  patch: Partial<Apartment>
): Promise<{ apartment: Apartment | null; persisted: boolean; persistError?: string }> {
  return withApartmentLock(async () => {
    const current = await listApartments();
    const idx = current.findIndex((a) => a.id === id);
    if (idx < 0) return { apartment: null, persisted: true };
    const merged = normalizeApartment({ ...current[idx], ...patch, id });
    current[idx] = merged;
    const saved = await replaceApartments(current);
    return {
      apartment: merged,
      persisted: saved.persisted,
      persistError: saved.persistError,
    };
  });
}

export async function deleteApartment(
  id: string
): Promise<{ ok: boolean; persisted: boolean; persistError?: string }> {
  return withApartmentLock(async () => {
    const current = await listApartments();
    const next = current.filter((a) => a.id !== id);
    if (next.length === current.length) {
      return { ok: false, persisted: true };
    }
    const saved = await replaceApartments(next);
    return {
      ok: true,
      persisted: saved.persisted,
      persistError: saved.persistError,
    };
  });
}

export function invalidateApartmentsCache(): void {
  memoryCache = null;
}
