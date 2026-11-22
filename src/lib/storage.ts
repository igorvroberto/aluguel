import seedApartments from "../../data/apartments.json";
import { STORAGE_KEY } from "./constants";
import type { Apartment } from "./types";

export function loadApartments(): Apartment[] {
  if (typeof window === "undefined") {
    return seedApartments as Apartment[];
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const seed = seedApartments as Apartment[];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    const parsed = JSON.parse(raw) as Apartment[];
    if (!Array.isArray(parsed) || parsed.length === 0) {
      const seed = seedApartments as Apartment[];
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(seed));
      return seed;
    }
    return parsed;
  } catch {
    return seedApartments as Apartment[];
  }
}

export function saveApartments(apartments: Apartment[]): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(apartments));
}
