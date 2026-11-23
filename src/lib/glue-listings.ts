/**
 * Parser do Glue API (ZAP Imóveis / Viva Real) — respostas /v2/listings.
 */
import { parseBRLNumber } from "./listing-parser";
import {
  PORTAL_LABELS,
  type PortalId,
  normalizePortalId,
} from "./portals";

export interface PortalListing {
  id?: string;
  titulo: string;
  endereco: string;
  bairro: string;
  aluguel: number;
  condominio: number;
  iptu: number;
  quartos: number;
  vagas?: number;
  areaM2?: number;
  portaria24h: boolean;
  linkAnuncio: string;
  portal: PortalId;
  portalLabel: string;
  lat?: number;
  lng?: number;
  descricao?: string;
  /** Bairro da busca (para fallback de coords). */
  searchNeighborhood?: string;
}

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === "object" && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function firstNum(v: unknown): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") return parseBRLNumber(v) ?? undefined;
  if (Array.isArray(v) && v.length > 0) return firstNum(v[0]);
  return undefined;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function amenityBlob(listing: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const key of ["amenities", "amenitiesList", "installationFeatures"]) {
    const val = listing[key];
    if (Array.isArray(val)) parts.push(val.map(String).join(" "));
    else if (typeof val === "string") parts.push(val);
  }
  return parts.join(" ").toUpperCase();
}

function rentalPricing(listing: Record<string, unknown>): {
  aluguel: number;
  condominio: number;
  iptuMonthly: number;
} {
  const infos = listing.pricingInfos;
  let aluguel = 0;
  let condominio = 0;
  let yearlyIptu = 0;

  if (Array.isArray(infos)) {
    const rental =
      infos.find((x) => {
        const o = asRecord(x);
        return (
          o &&
          String(o.businessType || "").toUpperCase().includes("RENT")
        );
      }) || infos[0];
    const p = asRecord(rental);
    if (p) {
      aluguel = firstNum(p.price) ?? 0;
      condominio = firstNum(p.monthlyCondoFee) ?? 0;
      yearlyIptu = firstNum(p.yearlyIptu) ?? 0;
    }
  }

  return {
    aluguel,
    condominio,
    iptuMonthly: yearlyIptu > 0 ? Math.round(yearlyIptu / 12) : 0,
  };
}

function listingLink(
  wrapper: Record<string, unknown>,
  listing: Record<string, unknown>,
  portal: PortalId
): string {
  const linkObj = asRecord(wrapper.link) || asRecord(listing.link);
  const href =
    pickStr(
      linkObj?.href,
      linkObj?.url,
      listing.href,
      listing.url,
      listing.permalink,
      listing.canonicalUrl
    ) || "";

  const id = pickStr(listing.id, listing.listingId, wrapper.id) || "";
  const base =
    portal === "zapimoveis"
      ? "https://www.zapimoveis.com.br"
      : "https://www.vivareal.com.br";

  if (href) {
    try {
      return new URL(href, base).toString().split("?")[0];
    } catch {
      return href.split("?")[0];
    }
  }
  if (id) return `${base}/imovel/${id}/`;
  return "";
}

function unwrapListingNodes(payload: unknown): Array<{
  wrapper: Record<string, unknown>;
  listing: Record<string, unknown>;
}> {
  const out: Array<{
    wrapper: Record<string, unknown>;
    listing: Record<string, unknown>;
  }> = [];
  const seen = new Set<unknown>();

  const push = (node: unknown) => {
    const wrapper = asRecord(node);
    if (!wrapper) return;
    const inner = asRecord(wrapper.listing) || wrapper;
    if (!inner) return;
    if (seen.has(inner)) return;
    // precisa ter preço ou endereço
    const hasPrice =
      Array.isArray(inner.pricingInfos) ||
      inner.price != null ||
      inner.rent != null;
    const hasAddr = inner.address != null || inner.neighborhood != null;
    if (!hasPrice && !hasAddr) return;
    seen.add(inner);
    out.push({ wrapper, listing: inner });
  };

  const walk = (node: unknown, depth: number) => {
    if (!node || depth > 10) return;
    if (Array.isArray(node)) {
      // array tipicamente de cards { listing, link }
      for (const item of node) {
        const rec = asRecord(item);
        if (rec && (rec.listing || rec.pricingInfos || rec.address)) {
          push(item);
        } else {
          walk(item, depth + 1);
        }
      }
      return;
    }
    const rec = asRecord(node);
    if (!rec) return;
    if (Array.isArray(rec.listings)) {
      for (const item of rec.listings) push(item);
    }
    const search = asRecord(rec.search);
    const result = asRecord(search?.result) || asRecord(rec.result);
    if (result && Array.isArray(result.listings)) {
      for (const item of result.listings) push(item);
    }
    for (const v of Object.values(rec)) {
      if (v && typeof v === "object") walk(v, depth + 1);
    }
  };

  walk(payload, 0);
  return out;
}

export function parseGlueListings(
  payload: unknown,
  portalRaw: string
): PortalListing[] {
  const portal = normalizePortalId(portalRaw);
  if (portal !== "zapimoveis" && portal !== "vivareal") return [];

  const nodes = unwrapListingNodes(payload);
  const out: PortalListing[] = [];
  const seenUrl = new Set<string>();

  for (const { wrapper, listing } of nodes) {
    const link = listingLink(wrapper, listing, portal);
    if (!link || seenUrl.has(link.toLowerCase())) continue;

    const address = asRecord(listing.address) || {};
    const point = asRecord(address.point) || {};
    const street = pickStr(
      address.street,
      [address.street, address.streetNumber].filter(Boolean).join(", ")
    );
    const bairro =
      pickStr(address.neighborhood, address.neighbourhood, listing.neighborhood) ||
      "";
    const city = pickStr(address.city) || "São Paulo";
    const endereco = [street, bairro, `${city} - SP`]
      .filter(Boolean)
      .join(", ");

    const pricing = rentalPricing(listing);
    if (pricing.aluguel <= 0) continue;

    const quartos =
      firstNum(listing.bedrooms) ??
      firstNum(listing.rooms) ??
      firstNum(listing.bedroomCount) ??
      0;
    const vagas = firstNum(listing.parkingSpaces) ?? firstNum(listing.garages);
    const areaM2 =
      firstNum(listing.usableAreas) ??
      firstNum(listing.totalAreas) ??
      firstNum(listing.area);

    const amenities = amenityBlob(listing);
    const portaria24h =
      amenities.includes("PORTARIA_24H") ||
      amenities.includes("PORTARIA 24") ||
      /PORTARIA.?24|DOORMAN|SECURITY/.test(amenities);

    const lat = firstNum(point.lat) ?? firstNum(address.lat);
    const lng =
      firstNum(point.lon) ??
      firstNum(point.lng) ??
      firstNum(address.lon) ??
      firstNum(address.lng);

    const titulo =
      pickStr(listing.title, listing.name, listing.description) ||
      `Apartamento ${quartos || "?"} qtos — ${bairro || "SP"}`;

    seenUrl.add(link.toLowerCase());
    out.push({
      id: pickStr(listing.id, listing.listingId),
      titulo: titulo.slice(0, 140),
      endereco: endereco || `${bairro || "São Paulo"}, São Paulo - SP`,
      bairro,
      aluguel: Math.round(pricing.aluguel),
      condominio: Math.round(pricing.condominio),
      iptu: pricing.iptuMonthly,
      quartos: Math.round(quartos || 0),
      vagas: vagas != null ? Math.round(vagas) : undefined,
      areaM2: areaM2 != null ? Math.round(areaM2) : undefined,
      portaria24h,
      linkAnuncio: link,
      portal,
      portalLabel: PORTAL_LABELS[portal],
      lat: lat != null ? Number(lat) : undefined,
      lng: lng != null ? Number(lng) : undefined,
      descricao: pickStr(listing.description)?.slice(0, 400),
    });
  }

  return out;
}

export function isGlueListingsUrl(url: string): boolean {
  const u = url.toLowerCase();
  // Busca clássica (/v2/listings) ou payloads com listings embutidos (vertex etc.)
  if (
    !(
      u.includes("glue-api.vivareal.com") ||
      u.includes("glue-api.zapimoveis.com.br")
    )
  ) {
    return u.includes("/v2/listings");
  }
  // Ignora recomendações de ERROR_PAGE (Cloudflare / showcase)
  if (u.includes("source=error_page") || u.includes("recommended-for-you")) {
    return false;
  }
  return (
    u.includes("/v2/listings") ||
    u.includes("listing") ||
    u.includes("/v2/")
  );
}

/** Chave soft para dedup entre ZAP e Viva Real (mesma base). */
export function softListingKey(l: {
  endereco?: string;
  address?: string;
  aluguel: number;
  areaM2?: number;
}): string {
  const addr = (l.endereco || l.address || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return `${addr}|${Math.round(l.aluguel)}|${Math.round(l.areaM2 || 0)}`;
}
