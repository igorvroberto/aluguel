import seedApartments from "../../data/apartments.json";
import { STORAGE_KEY } from "./constants";
import type { Apartment } from "./types";

export function getSeedApartments(): Apartment[] {
  return seedApartments as Apartment[];
}

export function loadApartments(): Apartment[] {
  if (typeof window === "undefined") {
    return getSeedApartments();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = getSeedApartments();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as Apartment[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = getSeedApartments();
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    return getSeedApartments();
  }
}

export function saveApartments(apartments: Apartment[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apartments));
}

/** User-added ids typically start with apt-{timestamp}; seed ids are stable slugs. */
export function isLikelyUserAdded(apt: Apartment): boolean {
  return /^apt-\d{10,}$/.test(apt.id);
}

/**
 * Merge seed base into current list without dropping manually added apartments.
 * Seed entries replace older seed copies by id; user-added stay.
 */
export function mergeWithSeedBase(current: Apartment[]): Apartment[] {
  const seed = getSeedApartments();
  const seedIds = new Set(seed.map((a) => a.id));
  const userKept = current.filter(
    (a) => !seedIds.has(a.id) || isLikelyUserAdded(a)
  );
  // Prefer latest seed data for known seed ids; keep extras that aren't in seed
  const byId = new Map<string, Apartment>();
  seed.forEach((a) => byId.set(a.id, a));
  userKept.forEach((a) => {
    if (!seedIds.has(a.id)) byId.set(a.id, a);
  });
  return Array.from(byId.values());
}

export function needsSeedRestore(current: Apartment[]): boolean {
  const seed = getSeedApartments();
  if (current.length >= seed.length) {
    const ids = new Set(current.map((a) => a.id));
    const missingSeed = seed.some((s) => !ids.has(s.id));
    return missingSeed;
  }
  return true;
}
