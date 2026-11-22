import { monthlyPackage } from "./format";
import type { Apartment } from "./types";

const GENERIC_HOST_HINTS = [
  "google.com/maps",
  "maps.google",
  "goo.gl/maps",
  "maps.app.goo.gl",
];

export function isGenericOrEmptyListingUrl(url?: string): boolean {
  if (!url || !url.trim()) return true;
  const lower = url.toLowerCase();
  return GENERIC_HOST_HINTS.some((h) => lower.includes(h));
}

/** Extrai nome da rua para busca (ex.: "Rua Turiassu"). */
export function streetSearchSlug(address: string): string {
  const first = address.split(",")[0]?.trim() || address;
  return first
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function buildQuintoAndarSearchUrl(apartment: Pick<
  Apartment,
  "address" | "rooms" | "aluguel" | "condominio" | "iptu"
>): string {
  const rooms = Math.min(Math.max(apartment.rooms || 1, 1), 3);
  const roomsPath = rooms === 1 ? "1-quarto" : `${rooms}-quartos`;
  const packageMax = Math.max(
    4000,
    Math.ceil(
      monthlyPackage(apartment.aluguel, apartment.condominio, apartment.iptu) /
        500
    ) * 500
  );
  const street = streetSearchSlug(apartment.address);
  const base =
    "https://www.quintoandar.com.br/alugar/imovel/perdizes-sao-paulo-sp-brasil";
  return `${base}/${roomsPath}/ate-${packageMax}-reais?q=${encodeURIComponent(
    street.replace(/-/g, " ")
  )}`;
}

export function buildZapSearchUrl(apartment: Pick<Apartment, "address" | "rooms">): string {
  const street = apartment.address.split(",")[0]?.trim() || "Perdizes";
  const rooms = Math.min(Math.max(apartment.rooms || 1, 1), 3);
  return (
    `https://www.zapimoveis.com.br/aluguel/apartamentos/sp+sao-paulo++perdizes/` +
    `${rooms}-quartos/?q=${encodeURIComponent(street)}`
  );
}

export function resolveListingUrl(apartment: Apartment): string {
  if (!isGenericOrEmptyListingUrl(apartment.externalUrl)) {
    return apartment.externalUrl;
  }
  // Sem anúncio real: não inventa busca genérica da região.
  return "";
}
