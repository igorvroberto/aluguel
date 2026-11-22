/**
 * CLI: varre portais públicos perto das estações L3 + L6 (ativas)
 * e grava em data/apartments.json (sem localStorage).
 *
 * Uso: npm run scrape
 */
import { config as loadEnv } from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import * as cheerio from "cheerio";
import * as turf from "@turf/turf";
import { chromium, type Browser, type Page } from "playwright";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_VERMELHA,
  type MetroStation,
} from "../data/linhasMetro";
import { DESTINATION } from "../src/lib/constants";
import { parseBRLNumber } from "../src/lib/listing-parser";

loadEnv({ path: path.join(process.cwd(), ".env.local") });
loadEnv({ path: path.join(process.cwd(), ".env") });

const ROOT = process.cwd();
const OUT_PATH = path.join(ROOT, "data", "apartments.json");

const RADIUS_M = 1000;
const MAX_PACKAGE = 4500;
const TARGET_ROOMS = 2;
const ORIGEM = "scraping" as const;

/** Faculdade Santa Marcelina — Campus Perdizes (destino do app). */
const SANTA_MARCELINA = {
  name: "Faculdade Santa Marcelina Perdizes",
  lat: DESTINATION.lat,
  lng: DESTINATION.lng,
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

interface ScrapedListing {
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
  origem: typeof ORIGEM;
  sourcePortal: string;
  lat?: number;
  lng?: number;
  descricao?: string;
}

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
  scrapedAt?: string;
  nearestStationId?: string;
  nearestStationName?: string;
  nearestStationDistanceM?: number;
  distanceToSantaMarcelinaM?: number;
}

function slugify(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function neighborhoodSlug(station: MetroStation): string {
  const base = station.name.split("–")[0].split("-")[0].trim();
  const slug = slugify(base);
  // aliases úteis para os portais
  if (slug.startsWith("sesc")) return "pompeia";
  if (slug.includes("palmeiras") || slug.includes("barra-funda")) {
    return "barra-funda";
  }
  if (slug.includes("guilhermina")) return "guilhermina-esperanca";
  if (slug.includes("patriarca")) return "patriarca";
  if (slug.includes("corinthians")) return "itaquera";
  if (slug.includes("bresser")) return "mooca";
  if (slug.includes("carrao")) return "carrao";
  if (slug.includes("penha")) return "penha";
  return slug;
}

function log(...args: unknown[]) {
  console.log(`[scrape]`, ...args);
}

function isBlocked(status: number, html: string): boolean {
  if ([401, 403, 429, 503].includes(status)) return true;
  if (!html || html.trim().length < 400) return true;
  const lower = html.slice(0, 10000).toLowerCase();
  return (
    lower.includes("captcha") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("access denied") ||
    lower.includes("datadome") ||
    lower.includes("bot detection") ||
    lower.includes("varnish") ||
    lower.includes("please enable javascript") ||
    lower.includes("unusual traffic") ||
    lower.includes("cloudflare")
  );
}

async function fetchHtml(url: string): Promise<{
  status: number;
  html: string;
  blocked: boolean;
}> {
  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        "User-Agent": UA,
        Accept:
          "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
        "Cache-Control": "no-cache",
        Referer: "https://www.google.com/",
      },
      signal: AbortSignal.timeout(20000),
    });
    const html = await res.text();
    return { status: res.status, html, blocked: isBlocked(res.status, html) };
  } catch {
    return { status: 0, html: "", blocked: true };
  }
}

let browserPromise: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (!browserPromise) {
    browserPromise = chromium.launch({
      headless: false, // pedido: headless false (+ xvfb no npm script)
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1365,900",
      ],
    });
  }
  return browserPromise;
}

async function playwrightHtml(url: string): Promise<string | null> {
  let page: Page | null = null;
  try {
    const browser = await getBrowser();
    page = await browser.newPage({
      userAgent: UA,
      locale: "pt-BR",
      viewport: { width: 1365, height: 900 },
    });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, "webdriver", { get: () => undefined });
    });
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
    await page.waitForTimeout(2000);
    // Rola para carregar cards lazy
    for (let i = 0; i < 6; i++) {
      await page.mouse.wheel(0, 1400);
      await page.waitForTimeout(700);
    }
    const html = await page.content();
    return html;
  } catch (err) {
    log("playwright falhou:", err instanceof Error ? err.message : err);
    return null;
  } finally {
    await page?.close().catch(() => undefined);
  }
}

async function loadPageHtml(
  url: string,
  portal: string
): Promise<{ html: string; via: "fetch" | "playwright" | "none" }> {
  const fetched = await fetchHtml(url);
  if (!fetched.blocked && fetched.html) {
    log(`${portal}: fetch OK (${fetched.status})`);
    return { html: fetched.html, via: "fetch" };
  }
  log(`${portal}: bloqueado/vazio (status=${fetched.status}) → Playwright`);
  const html = await playwrightHtml(url);
  if (html && !isBlocked(200, html)) {
    return { html, via: "playwright" };
  }
  return { html: "", via: "none" };
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

function absUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString();
  } catch {
    return href;
  }
}

function looksListing(o: Record<string, unknown>): boolean {
  const keys = Object.keys(o).map((k) => k.toLowerCase());
  const price =
    keys.some((k) =>
      [
        "price",
        "rent",
        "rentprice",
        "rentalprice",
        "totalcost",
        "aluguel",
        "monthlyrentalprice",
      ].includes(k)
    ) ||
    typeof o.price === "number" ||
    typeof o.rent === "number" ||
    typeof o.rentPrice === "number";
  const addr = keys.some((k) =>
    [
      "address",
      "street",
      "streetname",
      "neighbourhood",
      "neighborhood",
      "region",
      "regionname",
    ].includes(k)
  );
  const urlish =
    typeof o.href === "string" ||
    typeof o.url === "string" ||
    typeof o.permalink === "string" ||
    o.houseId != null ||
    o.id != null;
  return (price || addr) && urlish;
}

function streetFromAddressField(address: unknown): string | undefined {
  if (typeof address === "string") return address.trim() || undefined;
  if (address && typeof address === "object") {
    const a = address as Record<string, unknown>;
    return pickStr(
      a.streetAddress,
      a.street,
      a.address,
      a.name,
      [a.street, a.number].filter((x) => typeof x === "string").join(", ")
    );
  }
  return undefined;
}

function fromObj(
  o: Record<string, unknown>,
  portal: string,
  pageUrl: string
): ScrapedListing | null {
  let link =
    pickStr(o.href, o.url, o.permalink, o.canonicalUrl, o.link) || "";
  if (link) link = absUrl(link, pageUrl);
  if (!link && (o.houseId != null || o.id != null) && portal === "quintoandar") {
    link = `https://www.quintoandar.com.br/imovel/${o.houseId ?? o.id}`;
  }
  if (!link || !/^https?:\/\//i.test(link)) return null;
  // só páginas de anúncio, não listagens genéricas
  if (
    !/\/imovel\/|\/apartamento|\/propriedades\/|id-\d+|\/id-/i.test(link) &&
    !link.includes("quintoandar.com.br/imovel/")
  ) {
    // ainda aceita se tiver houseId path
    if (!/\/\d{5,}/.test(link)) return null;
  }

  const street = streetFromAddressField(o.address) || pickStr(o.street, o.streetName, o.street_name);
  const bairro =
    pickStr(
      o.neighbourhood,
      o.neighborhood,
      o.regionName,
      o.region,
      o.bairro
    ) || "";
  const endereco = [street, bairro, "São Paulo - SP"].filter(Boolean).join(", ");

  const aluguel =
    pickNum(
      o.rentPrice,
      o.rent,
      o.rentalPrice,
      o.monthlyRentalPrice,
      o.price,
      (o.prices as Record<string, unknown> | undefined)?.rent,
      (o.pricingInfos as Array<Record<string, unknown>> | undefined)?.[0]?.price
    ) ?? 0;

  // QuintoAndar: condoIptu costuma ser condomínio+IPTU juntos
  const condoIptu = pickNum(o.condoIptu);
  let condominio =
    pickNum(
      o.condoFee,
      o.condominium,
      o.condo,
      o.monthlyCondoFee,
      (o.prices as Record<string, unknown> | undefined)?.condo
    ) ?? 0;
  let iptu =
    pickNum(
      o.iptu,
      o.propertyTax,
      (o.prices as Record<string, unknown> | undefined)?.iptu
    ) ?? 0;
  if (condoIptu != null && condominio === 0 && iptu === 0) {
    condominio = condoIptu;
  }

  const quartos =
    pickNum(o.bedrooms, o.rooms, o.bedroomCount, o.numberOfBedrooms) ?? 0;
  const areaM2 = pickNum(o.area, o.areaM2, o.totalArea, o.floorSize);
  const vagas = pickNum(o.parkingSpaces, o.parkingSpots, o.garages);
  const lat = pickNum(
    o.lat,
    o.latitude,
    (o.geo as Record<string, unknown> | undefined)?.lat,
    (o.address as Record<string, unknown> | undefined)?.lat
  );
  const lng = pickNum(
    o.lng,
    o.lon,
    o.longitude,
    (o.geo as Record<string, unknown> | undefined)?.lng,
    (o.address as Record<string, unknown> | undefined)?.lng
  );
  const installations = Array.isArray(o.installations)
    ? o.installations.map(String).join(" ")
    : "";
  const amenities = Array.isArray(o.amenities)
    ? o.amenities.map(String).join(" ")
    : "";
  const descricao = pickStr(
    o.shortRentDescription,
    o.description,
    o.amenitiesDescription
  );
  const blob = `${descricao || ""} ${installations} ${amenities}`;
  const portaria24h = Boolean(
    o.doorman ||
      o.portaria24h ||
      /portaria\s*24|24\s*h|PORTARIA_24|doorman/i.test(blob)
  );
  const titulo =
    pickStr(o.title, o.name, o.headline, o.shortRentDescription) ||
    `Apartamento ${quartos || TARGET_ROOMS} qtos — ${bairro || "SP"}`;

  if (aluguel <= 0 && !street) return null;

  return {
    titulo: titulo.slice(0, 140),
    endereco: endereco || `${bairro || "São Paulo"}, São Paulo - SP`,
    bairro,
    aluguel,
    condominio,
    iptu,
    quartos: quartos || TARGET_ROOMS,
    vagas,
    areaM2,
    portaria24h,
    linkAnuncio: link.split("?")[0],
    origem: ORIGEM,
    sourcePortal: portal,
    lat,
    lng,
    descricao: descricao?.slice(0, 400),
  };
}

/** Extrator dedicado: QuintoAndar `initialState.houses`. */
function extractQuintoAndarHouses(nextData: unknown): ScrapedListing[] {
  const out: ScrapedListing[] = [];
  const root = nextData as {
    props?: {
      pageProps?: {
        initialState?: { houses?: Record<string, Record<string, unknown>> };
      };
    };
  };
  const houses = root?.props?.pageProps?.initialState?.houses;
  if (!houses || typeof houses !== "object") return out;

  for (const [id, house] of Object.entries(houses)) {
    if (!house || typeof house !== "object") continue;
    if (house.forRent === false) continue;
    const item = fromObj(
      { ...house, id: house.id ?? id },
      "quintoandar",
      "https://www.quintoandar.com.br/"
    );
    if (item) out.push(item);
  }
  return out;
}

function extractListings(html: string, portal: string, pageUrl: string): ScrapedListing[] {
  const $ = cheerio.load(html);
  const out: ScrapedListing[] = [];
  const seen = new Set<string>();

  const nextRaw = $("#__NEXT_DATA__").html();
  if (nextRaw) {
    try {
      const data = JSON.parse(nextRaw) as unknown;
      if (portal === "quintoandar") {
        for (const item of extractQuintoAndarHouses(data)) {
          const k = item.linkAnuncio.toLowerCase();
          if (seen.has(k)) continue;
          seen.add(k);
          out.push(item);
        }
      }
      walk(data, (o) => {
        if (!looksListing(o)) return;
        // evita objetos “region/viewport” só com lat/lng
        if (o.rentPrice == null && o.rent == null && o.price == null && o.bedrooms == null) {
          return;
        }
        const item = fromObj(o, portal, pageUrl);
        if (!item) return;
        const k = item.linkAnuncio.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push(item);
      });
    } catch {
      // ignore
    }
  }

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      walk(parsed, (o) => {
        const type = String(o["@type"] || "").toLowerCase();
        if (
          type &&
          !type.includes("apartment") &&
          !type.includes("offer") &&
          !type.includes("product") &&
          !type.includes("residence") &&
          !type.includes("place") &&
          !type.includes("realestate")
        ) {
          return;
        }
        const item = fromObj(o, portal, pageUrl);
        if (!item) return;
        const k = item.linkAnuncio.toLowerCase();
        if (seen.has(k)) return;
        seen.add(k);
        out.push(item);
      });
    } catch {
      // ignore
    }
  });

  // Cards renderizados (Playwright) — só se não veio JSON estruturado
  if (out.length === 0) {
    const hrefHints = ["/imovel/", "/apartamento", "id-", "/id-"];
    $("a[href]").each((_, el) => {
      const href = $(el).attr("href") || "";
      if (!hrefHints.some((h) => href.includes(h))) return;
      const abs = absUrl(href, pageUrl).split("?")[0];
      if (seen.has(abs.toLowerCase())) return;
      const text = $(el).text().replace(/\s+/g, " ").trim();
      const street = text.match(
        /((?:Rua|R\.|Av\.?|Avenida|Alameda)\s+[A-Za-zÀ-ÿ0-9\s.'\-]{3,60})/i
      );
      const price = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
      const rooms = text.match(/(\d+)\s*(?:quarto|quartos|dorm)/i);
      const aluguel = price ? parseBRLNumber(price[1]) || 0 : 0;
      if (aluguel <= 0 || !street) return;
      seen.add(abs.toLowerCase());
      out.push({
        titulo: text.slice(0, 90) || `Anúncio ${portal}`,
        endereco: `${street[1].trim()}, São Paulo - SP`,
        bairro: "",
        aluguel,
        condominio: 0,
        iptu: 0,
        quartos: rooms ? Number(rooms[1]) : TARGET_ROOMS,
        portaria24h: /portaria\s*24|24\s*h/i.test(text),
        linkAnuncio: abs,
        origem: ORIGEM,
        sourcePortal: portal,
      });
    });
  }

  return out;
}

function buildSearchUrls(neigh: string): Array<{ portal: string; url: string }> {
  const rentMax = MAX_PACKAGE;
  return [
    {
      portal: "quintoandar",
      url:
        `https://www.quintoandar.com.br/alugar/imovel/${neigh}-sao-paulo-sp-brasil/apartamento` +
        `/de-0-a-${rentMax}/de-${TARGET_ROOMS}-a-${TARGET_ROOMS}-quartos`,
    },
    {
      portal: "vivareal",
      url:
        `https://www.vivareal.com.br/aluguel/sp/sao-paulo/${neigh}/apartamento_residencial/` +
        `?quartos=${TARGET_ROOMS}&preco-ate=${rentMax}`,
    },
    {
      portal: "zapimoveis",
      url:
        `https://www.zapimoveis.com.br/aluguel/apartamentos/sp+sao-paulo++${neigh}/` +
        `?quartos=${TARGET_ROOMS}&precoMaximo=${rentMax}`,
    },
    {
      portal: "imovelweb",
      url:
        `https://www.imovelweb.com.br/apartamentos-aluguel-${neigh}-sao-paulo.html` +
        `?precio-maximo=${rentMax}&ambientes=${TARGET_ROOMS}`,
    },
    {
      portal: "chavesnamao",
      url:
        `https://www.chavesnamao.com.br/apartamentos-para-alugar/sp-sao-paulo/${neigh}/` +
        `?valorMax=${rentMax}&quartos=${TARGET_ROOMS}`,
    },
  ];
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
      features?: Array<{ center: [number, number]; place_name: string }>;
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
    await new Promise((r) => setTimeout(r, 1100)); // rate limit
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
  listing: ScrapedListing,
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
    const d = turf.distance(pt, turf.point([s.lng, s.lat]), { units: "meters" });
    if (d < bestD) {
      bestD = d;
      best = s;
    }
  }
  return { station: best, distanceM: bestD };
}

function withinAnyStation(
  lat: number,
  lng: number,
  stations: MetroStation[],
  radiusM: number
): boolean {
  return nearestStation(lat, lng, stations).distanceM <= radiusM;
}

function normAddr(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function monthly(l: ScrapedListing): number {
  return l.aluguel + l.condominio + l.iptu;
}

async function main() {
  const stations: MetroStation[] = [...LINHA_VERMELHA, ...LINHA_LARANJA_ATIVAS];
  log(
    `estações: L3=${LINHA_VERMELHA.length} L6=${LINHA_LARANJA_ATIVAS.length} total=${stations.length}`
  );
  log(
    `critério: ${TARGET_ROOMS} dorms, pacote ≤ R$ ${MAX_PACKAGE}, raio ${RADIUS_M}m`
  );

  const mapboxToken = (process.env.NEXT_PUBLIC_MAPBOX_TOKEN || "").trim();
  if (!mapboxToken) {
    log(
      "AVISO: NEXT_PUBLIC_MAPBOX_TOKEN vazio — geocode via coords do anúncio + Nominatim"
    );
  }

  // Bairros únicos a partir das estações (prioriza L6 + oeste L3)
  const priorityIds = new Set([
    "l6-perdizes",
    "l6-sesc-pompeia",
    "l6-agua-branca",
    "l6-santa-marina",
    "l6-freguesia-do-o",
    "l6-joao-paulo-i",
    "l3-barra-funda",
    "l3-marechal-deodoro",
    "l3-santa-cecilia",
    "l3-republica",
  ]);
  const ordered = [
    ...stations.filter((s) => priorityIds.has(s.id)),
    ...stations.filter((s) => !priorityIds.has(s.id)),
  ];
  const neighMap = new Map<string, MetroStation>();
  for (const s of ordered) {
    const slug = neighborhoodSlug(s);
    if (!neighMap.has(slug)) neighMap.set(slug, s);
  }
  const neighborhoods = Array.from(neighMap.keys());
  log(`bairros únicos para busca: ${neighborhoods.length}`);

  const raw: ScrapedListing[] = [];
  const seenLinks = new Set<string>();
  let pages = 0;
  let playwrightPages = 0;

  for (const neigh of neighborhoods) {
    const urls = buildSearchUrls(neigh);
    for (const { portal, url } of urls) {
      pages += 1;
      log(`→ ${portal} / ${neigh}`);
      const { html, via } = await loadPageHtml(url, portal);
      if (via === "playwright") playwrightPages += 1;
      if (!html) {
        log(`  sem HTML (${portal}/${neigh})`);
        continue;
      }
      const items = extractListings(html, portal, url);
      let added = 0;
      for (const item of items) {
        const key = item.linkAnuncio.toLowerCase();
        if (seenLinks.has(key)) continue;
        seenLinks.add(key);
        raw.push(item);
        added += 1;
      }
      log(`  +${added} candidatos (via ${via})`);
    }
  }

  log(`brutos: ${raw.length} | páginas: ${pages} | playwright: ${playwrightPages}`);

  const filtered = raw.filter((r) => {
    if (r.quartos !== TARGET_ROOMS && r.quartos !== 0) {
      // aceita 0 (desconhecido) e filtra depois se necessário; exige 2 quando conhecido
      if (r.quartos > 0 && r.quartos !== TARGET_ROOMS) return false;
    }
    if (r.aluguel <= 0) return false;
    if (monthly(r) > MAX_PACKAGE) return false;
    return true;
  });

  // Preferir quartos=2 explícito; se veio 0, assume 2 (critério da busca)
  for (const r of filtered) {
    if (!r.quartos) r.quartos = TARGET_ROOMS;
  }

  log(`após filtro preço/quartos: ${filtered.length}`);

  const existingRaw = await fs.readFile(OUT_PATH, "utf8").catch(() => "[]");
  let existing: ApartmentRow[] = [];
  try {
    existing = JSON.parse(existingRaw) as ApartmentRow[];
    if (!Array.isArray(existing)) existing = [];
  } catch {
    existing = [];
  }

  const byUrl = new Map<string, ApartmentRow>();
  const byAddr = new Map<string, ApartmentRow>();
  for (const a of existing) {
    if (a.externalUrl) byUrl.set(a.externalUrl.trim().toLowerCase(), a);
    if (a.address) byAddr.set(normAddr(a.address), a);
  }

  const scrapedAt = new Date().toISOString();
  let added = 0;
  let skipped = 0;
  let geoFail = 0;
  let outOfRadius = 0;

  // Endereço precisa parecer rua/avenida para geocode útil
  const geocodeQueue = filtered.filter((l) =>
    /(rua|r\.|av\.?|avenida|alameda|travessa)/i.test(l.endereco)
  );
  log(
    `fila geocode: ${geocodeQueue.length}/${filtered.length} com endereço utilizável`
  );

  let geoDone = 0;
  for (const listing of geocodeQueue) {
    const urlKey = listing.linkAnuncio.trim().toLowerCase();
    const addrKey = normAddr(listing.endereco);
    if (byUrl.has(urlKey) || (addrKey && byAddr.has(addrKey))) {
      skipped += 1;
      continue;
    }

    const coords = await resolveCoords(listing, mapboxToken);
    geoDone += 1;
    if (geoDone % 25 === 0 || geoDone === geocodeQueue.length) {
      log(
        `geocode ${geoDone}/${geocodeQueue.length} · novos=${added} · semGeo=${geoFail} · foraRaio=${outOfRadius}`
      );
    }
    if (!coords) {
      geoFail += 1;
      continue;
    }
    if (!withinAnyStation(coords.lat, coords.lng, stations, RADIUS_M)) {
      outOfRadius += 1;
      continue;
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
        `portal=${listing.sourcePortal}`,
        listing.bairro ? `bairro=${listing.bairro}` : null,
        `estação=${near.station.name} (${Math.round(near.distanceM)}m)`,
        `${SANTA_MARCELINA.name}: ${Math.round(toFaculdade)}m`,
      ]
        .filter(Boolean)
        .join(" · "),
      status: "Candidato",
      source: ORIGEM,
      scrapedAt,
      nearestStationId: near.station.id,
      nearestStationName: near.station.name,
      nearestStationDistanceM: Math.round(near.distanceM),
      distanceToSantaMarcelinaM: Math.round(toFaculdade),
    };

    existing.push(row);
    byUrl.set(urlKey, row);
    if (addrKey) byAddr.set(addrKey, row);
    added += 1;
  }

  await fs.writeFile(OUT_PATH, `${JSON.stringify(existing, null, 2)}\n`, "utf8");

  log("——— resultado ———");
  log(`arquivo: ${OUT_PATH}`);
  log(`total no JSON: ${existing.length}`);
  log(`novos: ${added} | duplicados: ${skipped} | sem geo: ${geoFail} | fora do raio: ${outOfRadius}`);

  if (browserPromise) {
    const b = await browserPromise;
    await b.close().catch(() => undefined);
  }
}

main().catch(async (err) => {
  console.error(err);
  if (browserPromise) {
    try {
      await (await browserPromise).close();
    } catch {
      // ignore
    }
  }
  process.exit(1);
});
