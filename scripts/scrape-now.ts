/**
 * CLI: QuintoAndar + Chaves na Mão, fatiado por bairro × faixa de preço,
 * com paginação real ("Ver mais") e dedup só por URL.
 *
 * Uso: npm run scrape
 */
import { config as loadEnv } from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import * as turf from "@turf/turf";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_VERMELHA,
  type MetroStation,
} from "../data/linhasMetro";
import { DESTINATION } from "../src/lib/constants";
import type { PortalListing } from "../src/lib/glue-listings";
import {
  SEARCH_NEIGHBORHOODS,
  SEARCH_PRICE_BANDS,
  SCRAPE_ACTIVE_PORTALS,
  PORTAL_LABELS,
  PORTAL_IDS,
  type PortalId,
  type SearchPriceBand,
} from "../src/lib/portals";
import {
  buildPortalSearchUrls,
  closeSharedBrowser,
  getSharedBrowser,
  scrapeChavesPaginated,
  scrapeQuintoAndarPaginated,
  scrapeVivaRealFirefox,
  scrapeZapFirefox,
} from "../src/lib/portal-playwright";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "data", "apartments.json");

const TARGET_ROOMS = 2;
const ORIGEM = "scraping" as const;
const MAX_VER_MAIS_QA = 25;
const MAX_VER_MAIS_CNM = 12;

const SANTA_MARCELINA = {
  name: "Faculdade Santa Marcelina Perdizes",
  lat: DESTINATION.lat,
  lng: DESTINATION.lng,
};

const NEIGH_COORDS: Record<string, { lat: number; lng: number }> = {
  perdizes: { lat: -23.5385, lng: -46.6743 },
  pompeia: { lat: -23.5289, lng: -46.6881 },
  "agua-branca": { lat: -23.5208, lng: -46.6847 },
  "santa-marina": { lat: -23.5125, lng: -46.6905 },
  "freguesia-do-o": { lat: -23.4855, lng: -46.6995 },
  "barra-funda": { lat: -23.5255, lng: -46.6674 },
  "marechal-deodoro": { lat: -23.5338, lng: -46.6558 },
  "santa-cecilia": { lat: -23.5389, lng: -46.6498 },
  higienopolis: { lat: -23.5455, lng: -46.6565 },
  republica: { lat: -23.5437, lng: -46.6425 },
  belem: { lat: -23.5428, lng: -46.5895 },
  tatuape: { lat: -23.5401, lng: -46.5766 },
};

interface ApartmentRow {
  id: string;
  title: string;
  address: string;
  lat: number;
  lng: number;
  rooms: number;
  aluguel: number;
  condominio: number;
  iptu: number;
  portaria24h: boolean;
  externalUrl: string;
  areaM2?: number;
  parkingSpots?: number;
  notes?: string;
  status?: string;
  comments?: string;
  source?: string;
  portal?: string;
  scrapedAt?: string;
  nearestStationId?: string;
  nearestStationName?: string;
  nearestStationDistanceM?: number;
  distanceToSantaMarcelinaM?: number;
}

function log(...args: unknown[]) {
  console.log(`[scrape]`, ...args);
}

function countByPortal(items: Array<{ portal?: string; portalLabel?: string }>) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const label =
      item.portalLabel ||
      PORTAL_LABELS[item.portal as PortalId] ||
      item.portal ||
      "desconhecido";
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

function printCounts(title: string, counts: Record<string, number>) {
  log(title);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (!entries.length) {
    log("  (vazio)");
    return;
  }
  for (const [k, v] of entries) log(`  ${k}: ${v}`);
}

function inPriceBand(aluguel: number, band: SearchPriceBand): boolean {
  if (aluguel < band.min) return false;
  if (band.max != null && aluguel > band.max) return false;
  return true;
}

function nearestStation(
  lat: number,
  lng: number,
  stations: MetroStation[]
): { station: MetroStation; distanceM: number } {
  const pt = turf.point([lng, lat]);
  let best = stations[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const s of stations) {
    const d = turf.distance(pt, turf.point([s.lng, s.lat]), {
      units: "meters",
    });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { station: best, distanceM: bestD };
}

function fallbackCoords(listing: PortalListing): { lat: number; lng: number } {
  const neigh = (listing.searchNeighborhood || listing.bairro || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (neigh && NEIGH_COORDS[neigh]) return NEIGH_COORDS[neigh];
  for (const [k, v] of Object.entries(NEIGH_COORDS)) {
    if (neigh.includes(k.split("-")[0])) return v;
  }
  return { lat: SANTA_MARCELINA.lat, lng: SANTA_MARCELINA.lng };
}

async function geocodeMapbox(
  token: string,
  address: string
): Promise<{ lat: number; lng: number } | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(address)}.json` +
    `?access_token=${token}&country=BR&language=pt&types=address,poi` +
    `&bbox=-46.826,-23.78,-46.365,-23.356` +
    `&proximity=${SANTA_MARCELINA.lng},${SANTA_MARCELINA.lat}&limit=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
    const data = (await res.json()) as {
      features?: Array<{ center: [number, number] }>;
    };
    const f = data.features?.[0];
    if (!f) return null;
    return { lng: f.center[0], lat: f.center[1] };
  } catch {
    return null;
  }
}

async function geocodeNominatim(
  address: string
): Promise<{ lat: number; lng: number } | null> {
  if (!/(rua|r\.|av\.?|avenida|alameda|travessa)/i.test(address)) return null;
  const url =
    `https://nominatim.openstreetmap.org/search?` +
    `q=${encodeURIComponent(address + ", São Paulo, Brasil")}` +
    `&format=json&limit=1&countrycodes=br`;
  try {
    await new Promise((r) => setTimeout(r, 1100));
    const res = await fetch(url, {
      headers: {
        "User-Agent": "imoveis-radar-scrape/1.0 (local research)",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = (await res.json()) as Array<{ lat: string; lon: string }>;
    if (!data?.[0]) return null;
    return { lat: Number(data[0].lat), lng: Number(data[0].lon) };
  } catch {
    return null;
  }
}

async function resolveCoords(
  listing: PortalListing,
  mapboxToken: string
): Promise<{ lat: number; lng: number; fallback: boolean }> {
  if (
    listing.lat != null &&
    listing.lng != null &&
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng)
  ) {
    return { lat: listing.lat, lng: listing.lng, fallback: false };
  }
  if (mapboxToken) {
    const g = await geocodeMapbox(mapboxToken, listing.endereco);
    if (g) return { ...g, fallback: false };
  }
  const n = await geocodeNominatim(listing.endereco);
  if (n) return { ...n, fallback: false };
  return { ...fallbackCoords(listing), fallback: true };
}

async function scrapeSlice(
  portal: PortalId,
  url: string
): Promise<PortalListing[]> {
  if (portal === "quintoandar") {
    return scrapeQuintoAndarPaginated(url, {
      mode: "headed",
      maxClicks: MAX_VER_MAIS_QA,
    });
  }
  if (portal === "chavesnamao") {
    return scrapeChavesPaginated(url, {
      mode: "headed",
      maxClicks: MAX_VER_MAIS_CNM,
    });
  }
  if (portal === "vivareal") {
    return scrapeVivaRealFirefox(url);
  }
  if (portal === "zapimoveis") {
    return scrapeZapFirefox(url);
  }
  return [];
}

async function main() {
  const stations: MetroStation[] = [...LINHA_VERMELHA, ...LINHA_LARANJA_ATIVAS];
  log(
    `estações: L3=${LINHA_VERMELHA.length} L6=${LINHA_LARANJA_ATIVAS.length}`
  );
  log(`quartos: ${TARGET_ROOMS} · dedup: só URL/ID`);
  log(`bairros: ${SEARCH_NEIGHBORHOODS.join(", ")}`);
  log(
    `faixas: ${SEARCH_PRICE_BANDS.map((b) => b.label).join(" · ")}`
  );
  log(
    `portais ativos: ${SCRAPE_ACTIVE_PORTALS.map((id) => PORTAL_LABELS[id]).join(", ")}`
  );
  const skipped = PORTAL_IDS.filter((id) => !SCRAPE_ACTIVE_PORTALS.includes(id));
  if (skipped.length) {
    log(`portais pulados: ${skipped.map((id) => PORTAL_LABELS[id]).join(", ")}`);
  }

  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  await getSharedBrowser("headed");

  const raw: PortalListing[] = [];
  const seenLinks = new Set<string>();
  let slices = 0;

  for (const neigh of SEARCH_NEIGHBORHOODS) {
    for (const band of SEARCH_PRICE_BANDS) {
      const urls = buildPortalSearchUrls(neigh, {
        rooms: TARGET_ROOMS,
        priceBand: band,
      });
      for (const { portal, url } of urls) {
        slices += 1;
        log(
          `→ fatia ${slices} · ${PORTAL_LABELS[portal]} · ${neigh} · R$ ${band.label}`
        );
        let items: PortalListing[] = [];
        try {
          items = await scrapeSlice(portal, url);
        } catch (err) {
          log(`  erro:`, err instanceof Error ? err.message : err);
        }

        let added = 0;
        for (const item of items) {
          if (item.quartos > 0 && item.quartos !== TARGET_ROOMS) continue;
          if (item.aluguel <= 0) continue;
          if (!inPriceBand(item.aluguel, band)) continue;
          if (!item.quartos) item.quartos = TARGET_ROOMS;
          item.searchNeighborhood = neigh;
          if (!item.bairro) item.bairro = neigh;

          const key = item.linkAnuncio.trim().toLowerCase();
          if (!key || seenLinks.has(key)) continue;
          seenLinks.add(key);
          raw.push(item);
          added += 1;
        }
        log(
          `  +${added} novos nesta fatia (brutos API/DOM=${items.length}) · acumulado=${raw.length}`
        );
      }
    }
  }

  log(`brutos únicos por URL: ${raw.length} | fatias: ${slices}`);
  printCounts("resumo por portal (após fatias/filtros):", countByPortal(raw));

  const existingRaw = await fs.readFile(OUT_PATH, "utf8").catch(() => "[]");
  let existing: ApartmentRow[] = [];
  try {
    existing = JSON.parse(existingRaw) as ApartmentRow[];
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  // Dedup só por URL — remove chave soft por endereço
  const byUrl = new Map<string, ApartmentRow>();
  for (const a of existing) {
    if (a.externalUrl) byUrl.set(a.externalUrl.trim().toLowerCase(), a);
  }

  const scrapedAt = new Date().toISOString();
  let added = 0;
  let skippedDup = 0;
  let geoFallback = 0;
  const addedByPortal: Record<string, number> = {};

  // Completa rua a partir do título quando possível
  for (const l of raw) {
    if (/(rua|r\.|av\.?|avenida|alameda|travessa)/i.test(l.endereco)) continue;
    const fromTitle = l.titulo.match(
      /\b(?:na\s+)?((?:Rua|R\.|Av\.?|Avenida|Alameda)\s+[A-Za-zÀ-ÿ0-9\s.'\-]{3,60}(?:,\s*\d+)?)/i
    );
    if (fromTitle) {
      l.endereco = [fromTitle[1].trim(), l.bairro, "São Paulo - SP"]
        .filter(Boolean)
        .join(", ");
    }
  }

  log(`persistindo ${raw.length} anúncios (dedup URL contra JSON atual)…`);
  let done = 0;
  for (const listing of raw) {
    const urlKey = listing.linkAnuncio.trim().toLowerCase();
    if (byUrl.has(urlKey)) {
      skippedDup += 1;
      continue;
    }

    const coords = await resolveCoords(listing, mapboxToken);
    if (coords.fallback) geoFallback += 1;
    done += 1;
    if (done % 25 === 0 || done === raw.length) {
      log(
        `geo ${done}/${raw.length} · novos=${added} · dups=${skippedDup} · fallback=${geoFallback}`
      );
    }

    const near = nearestStation(coords.lat, coords.lng, stations);
    const toFaculdade = turf.distance(
      turf.point([coords.lng, coords.lat]),
      turf.point([SANTA_MARCELINA.lng, SANTA_MARCELINA.lat]),
      { units: "meters" }
    );

    const row: ApartmentRow = {
      id: `apt-scrape-${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 7)}`,
      title: listing.titulo,
      address: listing.endereco,
      lat: coords.lat,
      lng: coords.lng,
      rooms: listing.quartos || TARGET_ROOMS,
      aluguel: listing.aluguel,
      condominio: listing.condominio,
      iptu: listing.iptu,
      portaria24h: listing.portaria24h,
      externalUrl: listing.linkAnuncio,
      areaM2: listing.areaM2,
      parkingSpots: listing.vagas,
      notes: [
        `origem=${ORIGEM}`,
        `portal=${listing.portal}`,
        listing.bairro ? `bairro=${listing.bairro}` : null,
        coords.fallback ? "coords=fallback-bairro" : "coords=nativas-ou-geocode",
        `estação=${near.station.name} (${Math.round(near.distanceM)}m)`,
        `${SANTA_MARCELINA.name}: ${Math.round(toFaculdade)}m`,
      ]
        .filter(Boolean)
        .join(" · "),
      status: "Candidato",
      source: ORIGEM,
      portal: listing.portalLabel,
      scrapedAt,
      nearestStationId: near.station.id,
      nearestStationName: near.station.name,
      nearestStationDistanceM: Math.round(near.distanceM),
      distanceToSantaMarcelinaM: Math.round(toFaculdade),
    };

    existing.push(row);
    byUrl.set(urlKey, row);
    added += 1;
    addedByPortal[listing.portalLabel] =
      (addedByPortal[listing.portalLabel] || 0) + 1;
  }

  await fs.writeFile(OUT_PATH, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  const finalByPortal: Record<string, number> = {};
  for (const a of existing) {
    const label = a.portal || "Desconhecido";
    finalByPortal[label] = (finalByPortal[label] || 0) + 1;
  }

  log("——— resultado ———");
  log(`arquivo: ${OUT_PATH}`);
  log(`total no JSON: ${existing.length}`);
  log(
    `novos: ${added} | duplicados URL: ${skippedDup} | coords fallback: ${geoFallback}`
  );
  printCounts("novos por portal:", addedByPortal);
  printCounts("total no JSON por portal:", finalByPortal);

  await closeSharedBrowser();
}

main().catch(async (err) => {
  console.error(err);
  await closeSharedBrowser();
  process.exit(1);
});
