/**
 * CLI: varre QuintoAndar, ZAP, Viva Real, Chaves na Mão e Imovelweb
 * nos bairros das L3/L6 e grava em data/apartments.json.
 *
 * Uso: npm run scrape
 */
import { config as loadEnv } from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import * as turf from "@turf/turf";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_VERMELHA,
  type MetroStation,
} from "../data/linhasMetro";
import { DESTINATION } from "../src/lib/constants";
import { softListingKey, type PortalListing } from "../src/lib/glue-listings";
import { parseBRLNumber } from "../src/lib/listing-parser";
import {
  SEARCH_NEIGHBORHOODS,
  PORTAL_LABELS,
  type PortalId,
} from "../src/lib/portals";
import {
  buildPortalSearchUrls,
  closeSharedBrowser,
  getSharedBrowser,
  scrapeGlueSearchPage,
  scrapeHtmlSearchPage,
} from "../src/lib/portal-playwright";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "data", "apartments.json");

const MAX_PACKAGE = 4500;
const TARGET_ROOMS = 2;
const ORIGEM = "scraping" as const;

/** Centro aproximado por bairro de busca (fallback se geocode falhar). */
const NEIGH_COORDS: Record<string, { lat: number; lng: number }> = {
  perdizes: { lat: -23.5385, lng: -46.6743 },
  pompeia: { lat: -23.5289, lng: -46.6881 },
  "agua-branca": { lat: -23.5208, lng: -46.6847 },
  "barra-funda": { lat: -23.5255, lng: -46.6674 },
  "santa-cecilia": { lat: -23.5389, lng: -46.6498 },
  higienopolis: { lat: -23.5455, lng: -46.6565 },
  republica: { lat: -23.5437, lng: -46.6425 },
  belem: { lat: -23.5428, lng: -46.5895 },
  tatuape: { lat: -23.5401, lng: -46.5766 },
};

const SANTA_MARCELINA = {
  name: "Faculdade Santa Marcelina Perdizes",
  lat: DESTINATION.lat,
  lng: DESTINATION.lng,
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

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

function countByPortal(items: Array<{ portal?: string; sourcePortal?: string }>) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key =
      item.portal ||
      (item as { sourcePortal?: string }).sourcePortal ||
      "desconhecido";
    const label =
      PORTAL_LABELS[key as PortalId] || String(key);
    counts[label] = (counts[label] || 0) + 1;
  }
  return counts;
}

function printCounts(title: string, counts: Record<string, number>) {
  log(title);
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  if (entries.length === 0) {
    log("  (vazio)");
    return;
  }
  for (const [k, v] of entries) log(`  ${k}: ${v}`);
}

function pickNum(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseBRLNumber(v);
      if (n != null) return n;
    }
  }
  return undefined;
}

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function walk(node: unknown, visit: (o: Record<string, unknown>) => void, d = 0) {
  if (!node || d > 14) return;
  if (Array.isArray(node)) {
    for (const x of node) walk(x, visit, d + 1);
    return;
  }
  if (typeof node === "object") {
    const o = node as Record<string, unknown>;
    visit(o);
    for (const v of Object.values(o)) walk(v, visit, d + 1);
  }
}

/** Extrator QuintoAndar via __NEXT_DATA__ / fetch. */
async function scrapeQuintoAndar(url: string): Promise<PortalListing[]> {
  let html = "";
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept: "text/html",
        "Accept-Language": "pt-BR,pt;q=0.9",
      },
      signal: AbortSignal.timeout(25000),
    });
    html = await res.text();
  } catch {
    html = "";
  }

  // Se bloqueado, Playwright
  if (!html || html.length < 800 || /captcha|cloudflare|access denied/i.test(html.slice(0, 8000))) {
    const browser = await getSharedBrowser("headed");
    const page = await browser.newPage({
      userAgent: UA,
      locale: "pt-BR",
      viewport: { width: 1365, height: 900 },
    });
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2000);
      for (let i = 0; i < 5; i++) {
        await page.mouse.wheel(0, 1400);
        await page.waitForTimeout(600);
      }
      html = await page.content();
    } catch {
      html = "";
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  if (!html) return [];
  const $ = cheerio.load(html);
  const out: PortalListing[] = [];
  const seen = new Set<string>();

  const nextRaw = $("#__NEXT_DATA__").html();
  if (nextRaw) {
    try {
      const data = JSON.parse(nextRaw) as {
        props?: {
          pageProps?: {
            initialState?: { houses?: Record<string, Record<string, unknown>> };
          };
        };
      };
      const houses = data?.props?.pageProps?.initialState?.houses;
      if (houses) {
        for (const [id, house] of Object.entries(houses)) {
          if (!house || house.forRent === false) continue;
          const link =
            pickStr(house.href, house.url) ||
            `https://www.quintoandar.com.br/imovel/${house.houseId ?? house.id ?? id}`;
          const aluguel =
            pickNum(
              house.rentPrice,
              house.rent,
              (house.prices as Record<string, unknown> | undefined)?.rent
            ) ?? 0;
          if (aluguel <= 0) continue;
          const addrObj =
            typeof house.address === "object" && house.address
              ? (house.address as Record<string, unknown>)
              : null;
          const street = pickStr(
            typeof house.address === "string" ? house.address : undefined,
            addrObj?.address,
            addrObj?.street,
            addrObj?.streetName,
            house.street,
            house.streetName
          );
          const bairro =
            pickStr(
              house.neighbourhood,
              house.neighborhood,
              house.regionName,
              house.region
            ) || "";
          const condoIptu = pickNum(house.condoIptu);
          let condominio =
            pickNum(
              house.condoFee,
              house.condo,
              (house.prices as Record<string, unknown> | undefined)?.condo
            ) ?? 0;
          let iptu =
            pickNum(
              house.iptu,
              (house.prices as Record<string, unknown> | undefined)?.iptu
            ) ?? 0;
          if (condoIptu != null && condominio === 0 && iptu === 0) {
            condominio = condoIptu;
          }
          const k = link.split("?")[0].toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push({
            titulo:
              pickStr(house.title, house.shortRentDescription) ||
              `Apartamento ${TARGET_ROOMS} qtos — ${bairro || "SP"}`,
            endereco: [street, bairro, "São Paulo - SP"].filter(Boolean).join(", "),
            bairro,
            aluguel,
            condominio,
            iptu,
            quartos:
              pickNum(house.bedrooms, house.rooms, house.bedroomCount) ||
              TARGET_ROOMS,
            vagas: pickNum(house.parkingSpots, house.parkingSpaces),
            areaM2: pickNum(house.area, house.areaM2, house.totalArea),
            portaria24h: Boolean(
              house.doorman ||
                /portaria\s*24|PORTARIA_24/i.test(
                  String(house.installations || house.amenities || "")
                )
            ),
            linkAnuncio: link.split("?")[0],
            portal: "quintoandar",
            portalLabel: PORTAL_LABELS.quintoandar,
            lat: pickNum(house.lat, house.latitude, addrObj?.lat, addrObj?.latitude),
            lng: pickNum(
              house.lng,
              house.lon,
              house.longitude,
              addrObj?.lng,
              addrObj?.lon,
              addrObj?.longitude
            ),
          });
        }
      }

      // walk genérico de apoio
      walk(data, (o) => {
        if (o.rentPrice == null && o.rent == null && o.bedrooms == null) return;
        const id = o.houseId ?? o.id;
        if (id == null) return;
        const link = `https://www.quintoandar.com.br/imovel/${id}`;
        const k = link.toLowerCase();
        if (seen.has(k)) return;
        const aluguel = pickNum(o.rentPrice, o.rent) ?? 0;
        if (aluguel <= 0) return;
        seen.add(k);
        out.push({
          titulo: pickStr(o.title, o.shortRentDescription) || `Apartamento QuintoAndar`,
          endereco: [
            pickStr(o.street, o.streetName),
            pickStr(o.neighbourhood, o.neighborhood, o.regionName),
            "São Paulo - SP",
          ]
            .filter(Boolean)
            .join(", "),
          bairro: pickStr(o.neighbourhood, o.neighborhood, o.regionName) || "",
          aluguel,
          condominio: pickNum(o.condoFee, o.condoIptu) ?? 0,
          iptu: pickNum(o.iptu) ?? 0,
          quartos: pickNum(o.bedrooms, o.rooms) || TARGET_ROOMS,
          vagas: pickNum(o.parkingSpaces),
          areaM2: pickNum(o.area, o.areaM2),
          portaria24h: Boolean(o.doorman),
          linkAnuncio: link,
          portal: "quintoandar",
          portalLabel: PORTAL_LABELS.quintoandar,
          lat: pickNum(o.lat, o.latitude),
          lng: pickNum(o.lng, o.lon, o.longitude),
        });
      });
    } catch {
      // ignore
    }
  }

  return out;
}

async function scrapePortalPage(
  portal: PortalId,
  url: string
): Promise<PortalListing[]> {
  if (portal === "zapimoveis" || portal === "vivareal") {
    return scrapeGlueSearchPage(url, portal, { mode: "headed" });
  }
  if (portal === "chavesnamao" || portal === "imovelweb") {
    return scrapeHtmlSearchPage(url, portal, { mode: "headed" });
  }
  return scrapeQuintoAndar(url);
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
): Promise<{ lat: number; lng: number } | null> {
  if (
    listing.lat != null &&
    listing.lng != null &&
    Number.isFinite(listing.lat) &&
    Number.isFinite(listing.lng)
  ) {
    return { lat: listing.lat, lng: listing.lng };
  }
  if (mapboxToken) {
    const g = await geocodeMapbox(mapboxToken, listing.endereco);
    if (g) return g;
  }
  return geocodeNominatim(listing.endereco);
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

function monthly(l: PortalListing): number {
  return l.aluguel + l.condominio + l.iptu;
}

function fallbackCoords(listing: PortalListing): { lat: number; lng: number } {
  const neigh = (listing.searchNeighborhood || listing.bairro || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  if (neigh && NEIGH_COORDS[neigh]) return NEIGH_COORDS[neigh];
  // aliases
  if (neigh.includes("pompe")) return NEIGH_COORDS.pompeia;
  if (neigh.includes("agua")) return NEIGH_COORDS["agua-branca"];
  if (neigh.includes("barra")) return NEIGH_COORDS["barra-funda"];
  if (neigh.includes("cecil")) return NEIGH_COORDS["santa-cecilia"];
  if (neigh.includes("higien")) return NEIGH_COORDS.higienopolis;
  if (neigh.includes("repub")) return NEIGH_COORDS.republica;
  if (neigh.includes("belem")) return NEIGH_COORDS.belem;
  if (neigh.includes("tatu")) return NEIGH_COORDS.tatuape;
  if (neigh.includes("perdiz")) return NEIGH_COORDS.perdizes;
  return {
    lat: SANTA_MARCELINA.lat,
    lng: SANTA_MARCELINA.lng,
  };
}

async function main() {
  const stations: MetroStation[] = [...LINHA_VERMELHA, ...LINHA_LARANJA_ATIVAS];
  log(
    `estações: L3=${LINHA_VERMELHA.length} L6=${LINHA_LARANJA_ATIVAS.length} total=${stations.length}`
  );
  log(
    `critério: ${TARGET_ROOMS} dorms, pacote ≤ R$ ${MAX_PACKAGE} (sem corte por raio na gravação)`
  );
  log(`bairros de busca: ${SEARCH_NEIGHBORHOODS.join(", ")}`);

  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  if (!mapboxToken) {
    log(
      "AVISO: NEXT_PUBLIC_MAPBOX_TOKEN vazio — usa coords nativas + Nominatim"
    );
  }

  await getSharedBrowser("headed");

  const raw: PortalListing[] = [];
  const seenLinks = new Set<string>();
  let pages = 0;

  for (const neigh of SEARCH_NEIGHBORHOODS) {
    const urls = buildPortalSearchUrls(neigh, {
      rooms: TARGET_ROOMS,
      maxPackage: MAX_PACKAGE,
    });
    for (const { portal, url } of urls) {
      pages += 1;
      log(`→ ${PORTAL_LABELS[portal]} / ${neigh}`);
      let items: PortalListing[] = [];
      try {
        items = await scrapePortalPage(portal, url);
      } catch (err) {
        log(
          `  erro:`,
          err instanceof Error ? err.message : err
        );
      }
      let added = 0;
      for (const item of items) {
        const key = item.linkAnuncio.toLowerCase();
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);
        item.searchNeighborhood = neigh;
        if (!item.bairro) item.bairro = neigh;
        raw.push(item);
        added += 1;
      }
      log(`  +${added} candidatos`);
    }
  }

  log(`brutos: ${raw.length} | páginas: ${pages}`);
  printCounts("resumo por portal (antes dos filtros):", countByPortal(raw));

  const filtered = raw.filter((r) => {
    if (r.quartos > 0 && r.quartos !== TARGET_ROOMS) return false;
    if (r.aluguel <= 0) return false;
    if (monthly(r) > MAX_PACKAGE) return false;
    return true;
  });
  for (const r of filtered) {
    if (!r.quartos) r.quartos = TARGET_ROOMS;
  }

  log(`após filtro preço/quartos: ${filtered.length}`);
  printCounts(
    "resumo por portal (após preço/quartos):",
    countByPortal(filtered)
  );

  const existingRaw = await fs.readFile(OUT_PATH, "utf8").catch(() => "[]");
  let existing: ApartmentRow[] = [];
  try {
    existing = JSON.parse(existingRaw) as ApartmentRow[];
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  const byUrl = new Map<string, ApartmentRow>();
  const bySoft = new Map<string, ApartmentRow>();
  for (const a of existing) {
    if (a.externalUrl) byUrl.set(a.externalUrl.trim().toLowerCase(), a);
    bySoft.set(
      softListingKey({
        address: a.address,
        aluguel: a.aluguel,
        areaM2: a.areaM2,
      }),
      a
    );
  }

  const scrapedAt = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  let geoFallback = 0;
  const addedByPortal: Record<string, number> = {};

  // Completa endereço a partir do título quando o card só traz bairro/cidade
  for (const l of filtered) {
    if (/(rua|r\.|av\.?|avenida|alameda|travessa)/i.test(l.endereco)) continue;
    const fromTitle =
      l.titulo.match(
        /\b(?:na\s+)?((?:Rua|R\.|Av\.?|Avenida|Alameda)\s+[A-Za-zÀ-ÿ0-9\s.'\-]{3,60}(?:,\s*\d+)?)/i
      ) || null;
    if (fromTitle) {
      l.endereco = [fromTitle[1].trim(), l.bairro, "São Paulo - SP"]
        .filter(Boolean)
        .join(", ");
    }
  }

  // Grava TODOS após preço/quartos — só pula duplicados
  const queue = filtered;
  log(`fila persistência: ${queue.length} (todos após preço/quartos)`);

  let done = 0;
  for (const listing of queue) {
    const urlKey = listing.linkAnuncio.trim().toLowerCase();
    const softKey = softListingKey(listing);
    if (byUrl.has(urlKey) || bySoft.has(softKey)) {
      skipped += 1;
      continue;
    }

    let coords = await resolveCoords(listing, mapboxToken);
    let usedFallback = false;
    if (!coords) {
      coords = fallbackCoords(listing);
      usedFallback = true;
      geoFallback += 1;
    }
    done += 1;
    if (done % 25 === 0 || done === queue.length) {
      log(
        `geo ${done}/${queue.length} · novos=${added} · fallbackCoords=${geoFallback}`
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
        usedFallback ? "coords=fallback-bairro" : "coords=nativas-ou-geocode",
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
    bySoft.set(softKey, row);
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
    `novos: ${added} | duplicados: ${skipped} | coords fallback bairro: ${geoFallback}`
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
