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
    portal: raw.portal != null ? String(raw.portal) : undefined,
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

function countListingUrls(apartments: Apartment[]): number {
  return apartments.filter((a) =>
    /\/imovel\/\d+/i.test(a.externalUrl.trim())
  ).length;
}

function isHandEnteredApartment(apt: Apartment): boolean {
  if (apt.status === "Manual") return true;
  if ((apt.source || "").toLowerCase() === "manual") return true;
  if ((apt.portal || "").toLowerCase() === "manual") return true;
  return false;
}

/**
 * Volume antigo (seed manual sem links) vs seed da imagem (scrape com /imovel/…).
 * Se o seed tiver bem mais anúncios reais, substitui o volume — preserva
 * status/comentários quando o endereço bater e **sempre** mantém imóveis
 * inseridos à mão (status/source/portal Manual).
 */
async function hydrateEmptyUrlsFromSeed(
  apartments: Apartment[]
): Promise<Apartment[]> {
  const seedDir =
    process.env.APARTMENTS_SEED_DIR ||
    path.join(process.cwd(), "data-seed");
  const seedPath = path.join(seedDir, "apartments.json");
  try {
    const raw = await fs.readFile(seedPath, "utf8");
    const seed = JSON.parse(raw) as unknown;
    if (!Array.isArray(seed) || seed.length === 0) return apartments;

    const seedList = seed.map((item) =>
      normalizeApartment(item as Partial<Apartment>)
    );
    const seedUrls = countListingUrls(seedList);
    const currentUrls = countListingUrls(apartments);

    // Seed do scrape é claramente melhor → adota o seed
    if (seedUrls >= 20 && seedUrls > currentUrls + 5) {
      const byAddr = new Map(
        apartments.map((a) => [a.address.trim().toLowerCase(), a])
      );
      const seedIds = new Set(seedList.map((s) => s.id));
      const seedAddrs = new Set(
        seedList.map((s) => s.address.trim().toLowerCase()).filter(Boolean)
      );
      const merged = seedList.map((s) => {
        const prev = byAddr.get(s.address.trim().toLowerCase());
        if (!prev) return s;
        return normalizeApartment({
          ...s,
          status: prev.status || s.status,
          comments: prev.comments ?? s.comments,
        });
      });
      // Não apagar cadastros manuais do volume em deploys/restarts.
      for (const prev of apartments) {
        if (!isHandEnteredApartment(prev)) continue;
        const addr = prev.address.trim().toLowerCase();
        if (seedIds.has(prev.id)) continue;
        if (addr && seedAddrs.has(addr)) continue;
        merged.push(prev);
      }
      memoryCache = merged;
      await writeToDisk(merged);
      return merged;
    }

    const byId = new Map(seedList.map((a) => [a.id, a]));
    const byAddrPrice = new Map(
      seedList.map((a) => [
        `${a.address.trim().toLowerCase()}|${a.aluguel}|${a.rooms}`,
        a,
      ])
    );

    let changed = false;
    const next = apartments.map((apt) => {
      const url = apt.externalUrl.trim();
      if (url && /\/imovel\/\d+/i.test(url)) return apt;
      const donor =
        byId.get(apt.id) ||
        byAddrPrice.get(
          `${apt.address.trim().toLowerCase()}|${apt.aluguel}|${apt.rooms}`
        );
      const donorUrl = donor?.externalUrl.trim() || "";
      if (!donorUrl || !/\/imovel\/\d+/i.test(donorUrl)) return apt;
      changed = true;
      return { ...apt, externalUrl: donorUrl };
    });

    if (changed) {
      memoryCache = next;
      await writeToDisk(next);
      return next;
    }
  } catch {
    // seed ausente — ok
  }
  return apartments;
}

export async function listApartments(): Promise<Apartment[]> {
  if (!memoryCache) {
    memoryCache = await readFromDisk();
    memoryCache = await hydrateEmptyUrlsFromSeed(memoryCache);
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
