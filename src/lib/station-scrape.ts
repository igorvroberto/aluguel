import * as cheerio from "cheerio";
import * as turf from "@turf/turf";
import { METRO_STATIONS, type MetroStation } from "../../data/linhasMetro";
import { extractFromHtml, parseBRLNumber } from "./listing-parser";
import {
  PORTAL_LABELS,
  SCRAPE_ACTIVE_PORTALS,
  SEARCH_PRICE_BANDS,
  normalizePortalId,
  type PortalId,
} from "./portals";
import {
  closeSharedBrowser,
  getSharedBrowser,
  scrapeChavesPaginated,
  scrapeQuintoAndarPaginated,
  scrapeVivaRealFirefox,
  scrapeZapFirefox,
} from "./portal-playwright";
import type { Apartment, ApartmentStatus } from "./types";

const DEFAULT_STATUS: ApartmentStatus = "Candidato";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export interface RawListingCandidate {
  title: string;
  address: string;
  aluguel: number;
  condominio: number;
  iptu: number;
  rooms: number;
  areaM2?: number;
  parkingSpots?: number;
  portaria24h: boolean;
  externalUrl: string;
  source: string;
  portal?: string;
  lat?: number;
  lng?: number;
  notes?: string;
}

export interface StationScrapeOptions {
  stationIds: string[];
  radiusMeters: number;
  maxPackage: number;
  rooms: Array<1 | 2 | 3>;
  mapboxToken?: string;
  /** Máximo de páginas/portais por estação (evita timeout). */
  maxPagesPerStation?: number;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Path de zona do Viva Real a partir do slug do bairro/estação. */
function vivaZonaForNeighborhood(neigh: string): string {
  const n = neigh.toLowerCase();
  if (
    /perdizes|pompeia|sumare|vila-madalena|pinheiros|alto-de-pinheiros|lapa|agua-branca|barra-funda|santa-cecilia|higienopolis|consolacao|bela-vista/.test(
      n
    )
  ) {
    return "zona-oeste";
  }
  if (/tatuape|belem|mooca|bras|penha/.test(n)) return "zona-leste";
  if (/santana|tucuruvi|casa-verde|freguesia/.test(n)) return "zona-norte";
  if (/saude|vila-mariana|ipiranga|jabaquara/.test(n)) return "zona-sul";
  if (/republica|se|centro|luz|anhangabau/.test(n)) return "centro";
  return "zona-oeste";
}

async function fetchHtml(
  url: string
): Promise<{ ok: boolean; status: number; html: string; blocked: boolean }> {
  try {
    const res = await fetch(url, {
      method: "GET",
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
      },
      signal: AbortSignal.timeout(18000),
    });
    const html = await res.text();
    const lower = html.slice(0, 6000).toLowerCase();
    const blocked =
      [401, 403, 429, 503].includes(res.status) ||
      lower.includes("captcha") ||
      lower.includes("cf-browser-verification") ||
      lower.includes("access denied") ||
      lower.includes("datadome");
    return { ok: res.ok, status: res.status, html, blocked };
  } catch {
    return { ok: false, status: 0, html: "", blocked: true };
  }
}

function extractNextData($: cheerio.CheerioAPI): unknown | null {
  const raw = $("#__NEXT_DATA__").html() || $('script#__NEXT_DATA__').html();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function walkCollect(
  node: unknown,
  visit: (obj: Record<string, unknown>) => void,
  depth = 0
): void {
  if (!node || depth > 12) return;
  if (Array.isArray(node)) {
    for (const item of node) walkCollect(item, visit, depth + 1);
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    visit(obj);
    for (const v of Object.values(obj)) walkCollect(v, visit, depth + 1);
  }
}

function looksLikeListing(obj: Record<string, unknown>): boolean {
  const keys = Object.keys(obj).map((k) => k.toLowerCase());
  const hasPrice =
    keys.some((k) =>
      ["price", "rent", "rentalprice", "totalcost", "aluguel", "monthlyrentalprice"].includes(
        k
      )
    ) ||
    typeof obj.price === "number" ||
    typeof obj.rent === "number";
  const hasAddr =
    keys.some((k) =>
      ["address", "street", "streetname", "neighbourhood", "neighborhood", "region"].includes(
        k
      )
    ) || typeof obj.address === "string";
  const hasUrl =
    typeof obj.href === "string" ||
    typeof obj.url === "string" ||
    typeof obj.permalink === "string" ||
    typeof obj.houseId === "number" ||
    typeof obj.id === "string" ||
    typeof obj.id === "number";
  return (hasPrice || hasAddr) && hasUrl;
}

function pickNumber(...vals: unknown[]): number | undefined {
  for (const v of vals) {
    if (typeof v === "number" && Number.isFinite(v)) return Math.round(v);
    if (typeof v === "string") {
      const n = parseBRLNumber(v);
      if (n != null) return n;
    }
  }
  return undefined;
}

function pickString(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
}

function absoluteUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function listingFromObject(
  obj: Record<string, unknown>,
  source: string,
  pageUrl: string
): RawListingCandidate | null {
  const href = pickString(
    obj.href,
    obj.url,
    obj.permalink,
    obj.canonicalUrl,
    obj.link
  );
  let externalUrl = href ? absoluteUrl(href, pageUrl) : "";
  if (!externalUrl && (obj.houseId != null || obj.id != null)) {
    const id = String(obj.houseId ?? obj.id);
    if (source.includes("quintoandar")) {
      externalUrl = `https://www.quintoandar.com.br/imovel/${id}`;
    }
  }
  if (!externalUrl) return null;

  const addressParts = [
    pickString(obj.address, obj.street, obj.streetName, obj.street_name),
    pickString(
      obj.neighbourhood,
      obj.neighborhood,
      obj.regionName,
      obj.region
    ),
    "São Paulo - SP",
  ].filter(Boolean);
  const address = addressParts.join(", ");

  const aluguel =
    pickNumber(
      obj.rent,
      obj.rentalPrice,
      obj.monthlyRentalPrice,
      obj.price,
      obj.totalCost,
      (obj.prices as Record<string, unknown> | undefined)?.rent,
      (obj.pricingInfos as Array<Record<string, unknown>> | undefined)?.[0]
        ?.price
    ) ?? 0;

  const condominio =
    pickNumber(
      obj.condoFee,
      obj.condominium,
      obj.condo,
      obj.monthlyCondoFee,
      (obj.prices as Record<string, unknown> | undefined)?.condo
    ) ?? 0;

  const iptu =
    pickNumber(
      obj.iptu,
      obj.propertyTax,
      (obj.prices as Record<string, unknown> | undefined)?.iptu
    ) ?? 0;

  const rooms =
    pickNumber(
      obj.bedrooms,
      obj.rooms,
      obj.bedroomCount,
      obj.numberOfBedrooms
    ) ?? 1;

  const areaM2 = pickNumber(
    obj.area,
    obj.areaM2,
    obj.totalArea,
    obj.floorSize
  );
  const parkingSpots = pickNumber(
    obj.parkingSpaces,
    obj.parkingSpots,
    obj.garages
  );

  const lat = pickNumber(
    obj.lat,
    obj.latitude,
    (obj.geo as Record<string, unknown> | undefined)?.lat,
    (obj.address as Record<string, unknown> | undefined)?.lat
  );
  const lng = pickNumber(
    obj.lng,
    obj.lon,
    obj.longitude,
    (obj.geo as Record<string, unknown> | undefined)?.lng,
    (obj.address as Record<string, unknown> | undefined)?.lng
  );

  const title =
    pickString(obj.title, obj.name, obj.headline) ||
    `Apartamento — ${address.split(",")[0] || "SP"}`;

  if (!address && aluguel <= 0) return null;

  const portalId = normalizePortalId(source);
  return {
    title,
    address: address || "São Paulo - SP",
    aluguel,
    condominio,
    iptu,
    rooms,
    areaM2,
    parkingSpots,
    portaria24h: Boolean(obj.doorman || obj.portaria24h),
    externalUrl,
    source,
    portal: portalId ? PORTAL_LABELS[portalId] : undefined,
    lat,
    lng,
    notes: pickString(obj.description)?.slice(0, 280),
  };
}

function extractFromNextData(
  nextData: unknown,
  source: string,
  pageUrl: string
): RawListingCandidate[] {
  const out: RawListingCandidate[] = [];
  const seen = new Set<string>();
  walkCollect(nextData, (obj) => {
    if (!looksLikeListing(obj)) return;
    const listing = listingFromObject(obj, source, pageUrl);
    if (!listing) return;
    const key = listing.externalUrl.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(listing);
  });
  return out;
}

function extractFromLdJson(
  $: cheerio.CheerioAPI,
  source: string,
  pageUrl: string
): RawListingCandidate[] {
  const out: RawListingCandidate[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      walkCollect(parsed, (obj) => {
        const type = String(obj["@type"] || "").toLowerCase();
        if (
          !type.includes("apartment") &&
          !type.includes("offer") &&
          !type.includes("product") &&
          !type.includes("residence") &&
          !type.includes("place")
        ) {
          return;
        }
        const listing = listingFromObject(obj, source, pageUrl);
        if (listing) out.push(listing);
      });
    } catch {
      // ignore
    }
  });
  return out;
}

function extractAnchorListings(
  $: cheerio.CheerioAPI,
  source: string,
  pageUrl: string,
  hrefIncludes: string[]
): RawListingCandidate[] {
  const out: RawListingCandidate[] = [];
  const seen = new Set<string>();
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!hrefIncludes.some((h) => href.includes(h))) return;
    const text = $(el).text().replace(/\s+/g, " ").trim();
    const abs = absoluteUrl(href, pageUrl);
    if (seen.has(abs)) return;
    seen.add(abs);
    const priceMatch = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
    const roomsMatch = text.match(/(\d+)\s*(?:quarto|quartos|dorm)/i);
    out.push({
      title: text.slice(0, 80) || `Anúncio ${source}`,
      address: text.slice(0, 120) || "São Paulo - SP",
      aluguel: priceMatch ? parseBRLNumber(priceMatch[1]) || 0 : 0,
      condominio: 0,
      iptu: 0,
      rooms: roomsMatch ? Number(roomsMatch[1]) : 1,
      portaria24h: false,
      externalUrl: abs,
      source,
    });
  });
  return out;
}

async function scrapeWithPlaywrightFallback(
  url: string
): Promise<string | null> {
  try {
    // Optional dependency — may be absent in slim Docker images.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const pw = await import("playwright").catch(() => null);
    if (!pw) return null;
    const browser = await pw.chromium.launch({
      headless: true,
      args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"],
    });
    try {
      const page = await browser.newPage({
        userAgent: UA,
        locale: "pt-BR",
      });
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 25000,
      });
      await page.waitForTimeout(1500);
      return await page.content();
    } finally {
      await browser.close();
    }
  } catch {
    return null;
  }
}

function buildSearchUrls(
  station: MetroStation,
  rooms: Array<1 | 2 | 3>,
  maxPackage: number
): Array<{ url: string; source: string }> {
  const neigh = slugify(station.name.split("–")[0].split("-")[0].trim());
  const roomMin = Math.min(...rooms);
  const roomMax = Math.max(...rooms);
  const active = new Set<string>(SCRAPE_ACTIVE_PORTALS);
  const out: Array<{ url: string; source: string }> = [];

  for (const band of SEARCH_PRICE_BANDS) {
    if (band.min > maxPackage) continue;
    const max = Math.min(band.max ?? maxPackage, maxPackage);
    if (max < band.min) continue;
    if (active.has("quintoandar")) {
      out.push({
        source: "quintoandar",
        url:
          `https://www.quintoandar.com.br/alugar/imovel/${neigh}-sao-paulo-sp-brasil/apartamento` +
          `/de-${band.min}-a-${max}/de-${roomMin}-a-${roomMax}-quartos` +
          `?proximity=${station.lat},${station.lng}`,
      });
    }
    if (active.has("chavesnamao")) {
      out.push({
        source: "chavesnamao",
        url:
          `https://www.chavesnamao.com.br/apartamentos-para-alugar/sp-sao-paulo/${neigh}/` +
          `?valorMin=${band.min}&valorMax=${max}&quartos=${roomMin}`,
      });
    }
    if (active.has("vivareal")) {
      // Zona heurística — Perdizes/Pompéia/etc. caem em zona-oeste.
      const zona = vivaZonaForNeighborhood(neigh);
      out.push({
        source: "vivareal",
        url:
          `https://www.vivareal.com.br/aluguel/sp/sao-paulo/${zona}/${neigh}/apartamento_residencial/` +
          `#quartos=${roomMin}&preco-ate=${max}&preco-desde=${band.min}`,
      });
    }
    if (active.has("zapimoveis")) {
      const zona = vivaZonaForNeighborhood(neigh);
      // Path ZAP: sp+sao-paulo+zona-oeste+perdizes (sem `++`).
      out.push({
        source: "zapimoveis",
        url:
          `https://www.zapimoveis.com.br/aluguel/apartamentos/sp+sao-paulo+${zona}+${neigh}/` +
          `${roomMin}-quartos/?transacao=aluguel&tipos=apartamento_residencial&quartos=${roomMin}&precoMaximo=${max}`,
      });
    }
  }
  return out;
}

function portalListingsToCandidates(
  source: string,
  items: Array<{
    titulo: string;
    endereco: string;
    aluguel: number;
    condominio: number;
    iptu: number;
    quartos: number;
    vagas?: number;
    areaM2?: number;
    portaria24h: boolean;
    linkAnuncio: string;
    portalLabel: string;
    lat?: number;
    lng?: number;
    descricao?: string;
  }>
): RawListingCandidate[] {
  return items.map((item) => ({
    title: item.titulo,
    address: item.endereco,
    aluguel: item.aluguel,
    condominio: item.condominio,
    iptu: item.iptu,
    rooms: item.quartos || 1,
    areaM2: item.areaM2,
    parkingSpots: item.vagas,
    portaria24h: item.portaria24h,
    externalUrl: item.linkAnuncio,
    source,
    portal: item.portalLabel,
    lat: item.lat,
    lng: item.lng,
    notes: item.descricao,
  }));
}

async function scrapePage(
  url: string,
  source: string,
  allowPlaywright: boolean
): Promise<{ listings: RawListingCandidate[]; warning?: string }> {
  const portal = normalizePortalId(source) as PortalId | undefined;

  // Viva / ZAP: Firefox (Chromium cai no Cloudflare / ERROR_PAGE)
  if (
    allowPlaywright &&
    (portal === "vivareal" || portal === "zapimoveis")
  ) {
    const label = portal === "zapimoveis" ? "ZAP" : "Viva Real";
    try {
      const items =
        portal === "zapimoveis"
          ? await scrapeZapFirefox(url)
          : await scrapeVivaRealFirefox(url);
      if (items.length > 0) {
        return { listings: portalListingsToCandidates(source, items) };
      }
      return {
        listings: [],
        warning: `${label}: Firefox não retornou cards (CF/URL?).`,
      };
    } catch (err) {
      return {
        listings: [],
        warning:
          err instanceof Error
            ? `${label}: ${err.message}`
            : `${label}: falha no Firefox.`,
      };
    }
  }

  // QuintoAndar / Chaves: paginação real quando Playwright liberado
  if (
    allowPlaywright &&
    portal &&
    (portal === "quintoandar" || portal === "chavesnamao")
  ) {
    try {
      await getSharedBrowser("headless");
      const items =
        portal === "quintoandar"
          ? await scrapeQuintoAndarPaginated(url, {
              mode: "headless",
              maxClicks: 12,
            })
          : await scrapeChavesPaginated(url, {
              mode: "headless",
              maxClicks: 8,
            });
      if (items.length > 0) {
        return { listings: portalListingsToCandidates(source, items) };
      }
    } catch {
      // cai no fetch HTML abaixo
    }
  }

  let fetched = await fetchHtml(url);
  if ((!fetched.ok || fetched.blocked) && allowPlaywright) {
    const html = await scrapeWithPlaywrightFallback(url);
    if (html) {
      fetched = { ok: true, status: 200, html, blocked: false };
    }
  }
  if (!fetched.html || fetched.blocked) {
    return {
      listings: [],
      warning: `${source}: bloqueado ou inacessível (${url})`,
    };
  }

  const $ = cheerio.load(fetched.html);
  const nextData = extractNextData($);
  const fromNext = nextData
    ? extractFromNextData(nextData, source, url)
    : [];
  const fromLd = extractFromLdJson($, source, url);
  const fromAnchors = extractAnchorListings($, source, url, [
    "/imovel/",
    "/apartamento",
    "/propriedades/",
    "/aluguel/",
  ]);

  const merged = [...fromNext, ...fromLd];
  if (merged.length === 0) {
    for (const a of fromAnchors.slice(0, 8)) {
      const detail = extractFromHtml(fetched.html, a.externalUrl);
      merged.push({
        ...a,
        title: detail.title || a.title,
        address: detail.address || a.address,
        aluguel: detail.aluguel ?? a.aluguel,
        condominio: detail.condominio ?? a.condominio,
        iptu: detail.iptu ?? a.iptu,
        rooms: detail.rooms ?? a.rooms,
        areaM2: detail.areaM2 ?? a.areaM2,
        parkingSpots: detail.parkingSpots ?? a.parkingSpots,
      });
    }
  }

  return { listings: merged };
}

async function geocodeAddress(
  token: string,
  address: string,
  proximity: { lat: number; lng: number }
): Promise<{ lat: number; lng: number } | null> {
  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(address)}.json` +
    `?access_token=${token}` +
    `&country=BR&language=pt&types=address,poi` +
    `&proximity=${proximity.lng},${proximity.lat}` +
    `&limit=1`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
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

function withinRadius(
  lat: number,
  lng: number,
  stations: MetroStation[],
  radiusMeters: number
): boolean {
  const pt = turf.point([lng, lat]);
  return stations.some((s) => {
    const d = turf.distance(pt, turf.point([s.lng, s.lat]), {
      units: "meters",
    });
    return d <= radiusMeters;
  });
}

function monthlyPackage(a: RawListingCandidate): number {
  return a.aluguel + a.condominio + a.iptu;
}

export async function scrapeStationsNative(
  opts: StationScrapeOptions
): Promise<{
  candidates: RawListingCandidate[];
  apartments: Array<Partial<Apartment>>;
  scanned: number;
  portals: string[];
  warnings: string[];
}> {
  const stations = METRO_STATIONS.filter((s) =>
    opts.stationIds.includes(s.id)
  );
  if (stations.length === 0) {
    return {
      candidates: [],
      apartments: [],
      scanned: 0,
      portals: [],
      warnings: ["Nenhuma estação válida selecionada."],
    };
  }

  const maxPages = opts.maxPagesPerStation ?? 2;
  const warnings: string[] = [];
  const portals = new Set<string>();
  const raw: RawListingCandidate[] = [];
  const seenUrl = new Set<string>();
  let scanned = 0;
  const allowPlaywright = process.env.ENABLE_PLAYWRIGHT_SCRAPE === "1";

  try {
    for (const station of stations) {
      // Fatias bairro×preço — limita pelo maxPages para não estourar timeout da API
      const urls = buildSearchUrls(station, opts.rooms, opts.maxPackage).slice(
        0,
        Math.max(4, maxPages * 2)
      );
      for (const item of urls) {
        scanned += 1;
        portals.add(item.source);
        const { listings, warning } = await scrapePage(
          item.url,
          item.source,
          allowPlaywright
        );
        if (warning) warnings.push(warning);
        for (const listing of listings) {
          const key = listing.externalUrl.trim().toLowerCase();
          if (!key || seenUrl.has(key)) continue;
          seenUrl.add(key);
          raw.push(listing);
        }
      }
    }
  } finally {
    if (allowPlaywright) {
      await closeSharedBrowser().catch(() => undefined);
    }
  }

  const roomSet = new Set(opts.rooms);
  const filteredBudget = raw.filter((r) => {
    if (r.aluguel <= 0) return false;
    const pkg = monthlyPackage(r);
    if (pkg > opts.maxPackage) return false;
    const rk = (r.rooms >= 3 ? 3 : r.rooms) as 1 | 2 | 3;
    if (roomSet.size > 0 && !roomSet.has(rk)) return false;
    return true;
  });

  const apartments: Array<Partial<Apartment>> = [];
  const token = opts.mapboxToken || process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "";
  const centerStation = stations[0];

  for (const listing of filteredBudget) {
    let lat = listing.lat;
    let lng = listing.lng;
    if (
      (lat == null || lng == null || !Number.isFinite(lat) || !Number.isFinite(lng)) &&
      token
    ) {
      const geo = await geocodeAddress(token, listing.address, {
        lat: centerStation.lat,
        lng: centerStation.lng,
      });
      if (geo) {
        lat = geo.lat;
        lng = geo.lng;
      }
    }
    if (lat == null || lng == null) {
      warnings.push(`Sem geocódigo: ${listing.address}`);
      continue;
    }
    if (!withinRadius(lat, lng, stations, opts.radiusMeters)) {
      continue;
    }

    const portalId = normalizePortalId(listing.source);
    apartments.push({
      id: `apt-scrape-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      title: listing.title,
      address: listing.address,
      lat,
      lng,
      rooms: listing.rooms,
      aluguel: listing.aluguel,
      condominio: listing.condominio,
      iptu: listing.iptu,
      portaria24h: listing.portaria24h,
      externalUrl: listing.externalUrl,
      areaM2: listing.areaM2,
      parkingSpots: listing.parkingSpots,
      notes: listing.notes,
      status: DEFAULT_STATUS,
      source: listing.source,
      portal: listing.portal || (portalId ? PORTAL_LABELS[portalId] : undefined),
      scrapedAt: new Date().toISOString(),
    });
  }

  return {
    candidates: filteredBudget,
    apartments,
    scanned,
    portals: Array.from(portals),
    warnings: warnings.slice(0, 40),
  };
}
