/**
 * Scraping Playwright: ZAP/Viva (intercept Glue JSON) + HTML portals (JSON-LD/DOM).
 * Viva Real: Chromium cai no Cloudflare; Firefox headless costuma passar e
 * expor cards/links de /imovel/… (teste Nov/2026).
 */
import * as cheerio from "cheerio";
import { chromium, firefox, type Browser, type Page } from "playwright";
import {
  isGlueListingsUrl,
  parseGlueListings,
  type PortalListing,
} from "./glue-listings";
import { parseBRLNumber } from "./listing-parser";
import {
  PORTAL_LABELS,
  SCRAPE_ACTIVE_PORTALS,
  normalizePortalId,
  type PortalId,
  type SearchPriceBand,
} from "./portals";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

export type PlaywrightMode = "headed" | "headless";

let sharedBrowser: Promise<Browser> | null = null;
let sharedFirefox: Promise<Browser> | null = null;

export async function getSharedBrowser(
  mode: PlaywrightMode = "headed"
): Promise<Browser> {
  if (!sharedBrowser) {
    sharedBrowser = chromium.launch({
      headless: mode === "headless",
      args: [
        "--no-sandbox",
        "--disable-dev-shm-usage",
        "--disable-blink-features=AutomationControlled",
        "--window-size=1365,900",
      ],
    });
  }
  return sharedBrowser;
}

/** Proxy opcional (residencial) — necessário p/ Imovelweb / Turnstile duro. */
function scrapeProxyServer(): string | undefined {
  const raw = (process.env.SCRAPE_PROXY_URL || "").trim();
  return raw || undefined;
}

/** Firefox: melhor taxa contra Cloudflare do Viva/ZAP neste ambiente. */
export async function getSharedFirefoxBrowser(): Promise<Browser> {
  if (!sharedFirefox) {
    const server = scrapeProxyServer();
    sharedFirefox = firefox.launch({
      headless: true,
      ...(server ? { proxy: { server } } : {}),
    });
  }
  return sharedFirefox;
}

export async function closeSharedBrowser(): Promise<void> {
  const jobs: Array<Promise<Browser> | null> = [sharedBrowser, sharedFirefox];
  sharedBrowser = null;
  sharedFirefox = null;
  for (const job of jobs) {
    if (!job) continue;
    try {
      const b = await job;
      await b.close();
    } catch {
      // ignore
    }
  }
}

async function newStealthPage(browser: Browser): Promise<Page> {
  const page = await browser.newPage({
    userAgent: UA,
    locale: "pt-BR",
    viewport: { width: 1365, height: 900 },
  });
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "webdriver", { get: () => undefined });
  });
  return page;
}

async function autoScroll(page: Page, steps = 8): Promise<void> {
  for (let i = 0; i < steps; i++) {
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(650);
  }
}

function toPortalListing(
  partial: Omit<PortalListing, "portal" | "portalLabel"> & {
    portal: string;
  }
): PortalListing | null {
  const portal = normalizePortalId(partial.portal);
  if (!portal) return null;
  return {
    ...partial,
    portal,
    portalLabel: PORTAL_LABELS[portal],
  };
}

/** ZAP / Viva Real: intercepta JSON do Glue API enquanto navega a busca. */
export async function scrapeGlueSearchPage(
  url: string,
  portalRaw: string,
  opts?: { mode?: PlaywrightMode; browser?: Browser }
): Promise<PortalListing[]> {
  const portal = normalizePortalId(portalRaw);
  if (portal !== "zapimoveis" && portal !== "vivareal") return [];

  const browser = opts?.browser || (await getSharedBrowser(opts?.mode || "headed"));
  const page = await newStealthPage(browser);
  const collected: PortalListing[] = [];
  const seen = new Set<string>();

  const onResponse = async (response: import("playwright").Response) => {
    try {
      const respUrl = response.url();
      if (!isGlueListingsUrl(respUrl)) return;
      const ct = (response.headers()["content-type"] || "").toLowerCase();
      if (!ct.includes("json") && !respUrl.includes("/v2/listings")) return;
      if (!response.ok()) return;
      const data = await response.json();
      for (const item of parseGlueListings(data, portal)) {
        const k = item.linkAnuncio.toLowerCase();
        if (seen.has(k)) continue;
        seen.add(k);
        collected.push(item);
      }
    } catch {
      // ignore non-JSON / aborted
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);
    await autoScroll(page, 7);
    await page.waitForTimeout(1500);
    // fallback: se não interceptou, tenta HTML/__NEXT_DATA__/ld+json
    // (ignora ERROR_PAGE / showcase do Cloudflare)
    if (collected.length === 0) {
      const html = await page.content();
      const pageTitle = await page.title().catch(() => "");
      const isErrorPage =
        /error page|access denied|just a moment|attention required/i.test(
          `${pageTitle} ${html.slice(0, 4000)}`
        ) || /source=showcase%2CERROR\+PAGE|source=showcase,ERROR/i.test(html);
      if (!isErrorPage) {
        for (const item of extractFromHtmlPortals(html, portal, url)) {
          const k = item.linkAnuncio.toLowerCase();
          if (seen.has(k)) continue;
          if (/ERROR\+PAGE|ERROR_PAGE|source=showcase/i.test(item.linkAnuncio)) {
            continue;
          }
          seen.add(k);
          collected.push(item);
        }
      }
    }
  } catch {
    // page errors
  } finally {
    page.off("response", onResponse);
    await page.close().catch(() => undefined);
  }
  return collected;
}

function absUrl(href: string, base: string): string {
  try {
    return new URL(href, base).toString().split("?")[0];
  } catch {
    return href.split("?")[0];
  }
}

function walk(
  node: unknown,
  visit: (o: Record<string, unknown>) => void,
  d = 0
): void {
  if (!node || d > 12) return;
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

function pickStr(...vals: unknown[]): string | undefined {
  for (const v of vals) {
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return undefined;
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

/** JSON-LD + cards DOM para Chaves na Mão / Imovelweb (e fallback genérico). */
export function extractFromHtmlPortals(
  html: string,
  portalRaw: string,
  pageUrl: string
): PortalListing[] {
  const portal = normalizePortalId(portalRaw);
  if (!portal) return [];
  const $ = cheerio.load(html);
  const out: PortalListing[] = [];
  const seen = new Set<string>();

  const push = (item: PortalListing | null) => {
    if (!item?.linkAnuncio) return;
    const k = item.linkAnuncio.toLowerCase();
    if (seen.has(k)) return;
    seen.add(k);
    out.push(item);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const raw = $(el).html();
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as unknown;
      walk(parsed, (o) => {
        const type = String(o["@type"] || "").toLowerCase();
        const isList =
          type.includes("itemlist") ||
          type.includes("realestate") ||
          type.includes("apartment") ||
          type.includes("offer") ||
          type.includes("product") ||
          type.includes("residence") ||
          Array.isArray(o.itemListElement);
        if (!isList && !o.url && !o.offers) return;

        const elements = Array.isArray(o.itemListElement)
          ? o.itemListElement
          : [o];
        for (const elItem of elements) {
          const node =
            elItem && typeof elItem === "object"
              ? ((elItem as Record<string, unknown>).item as
                  | Record<string, unknown>
                  | undefined) || (elItem as Record<string, unknown>)
              : null;
          if (!node) continue;
          const url = pickStr(node.url, node["@id"], o.url);
          if (!url) continue;
          const offers = (node.offers || o.offers) as
            | Record<string, unknown>
            | undefined;
          const aluguel =
            pickNum(offers?.price, node.price, node.rent) ?? 0;
          if (aluguel <= 0) continue;
          const addrObj =
            (node.address as Record<string, unknown> | undefined) || {};
          const street = pickStr(
            addrObj.streetAddress,
            node.streetAddress,
            typeof node.address === "string" ? node.address : undefined
          );
          const bairro =
            pickStr(addrObj.addressLocality, addrObj.neighborhood) || "";
          push(
            toPortalListing({
              titulo:
                pickStr(node.name, node.title) ||
                `Apartamento — ${bairro || "SP"}`,
              endereco: [street, bairro, "São Paulo - SP"]
                .filter(Boolean)
                .join(", "),
              bairro,
              aluguel,
              condominio: pickNum(node.condoFee, node.condominio) ?? 0,
              iptu: pickNum(node.iptu) ?? 0,
              quartos:
                pickNum(node.numberOfRooms, node.bedrooms, node.rooms) ?? 0,
              vagas: pickNum(node.parkingSpaces, node.garages),
              areaM2: pickNum(
                node.floorSize,
                (node.floorSize as Record<string, unknown> | undefined)?.value,
                node.area
              ),
              portaria24h: /portaria\s*24|PORTARIA_24/i.test(
                String(node.description || "")
              ),
              linkAnuncio: absUrl(url, pageUrl),
              portal,
              lat: pickNum(
                (addrObj.geo as Record<string, unknown> | undefined)?.latitude,
                node.latitude
              ),
              lng: pickNum(
                (addrObj.geo as Record<string, unknown> | undefined)?.longitude,
                node.longitude
              ),
            })
          );
        }
      });
    } catch {
      // ignore bad ld+json
    }
  });

  // DOM cards fallback
  const hrefHints =
    portal === "chavesnamao"
      ? ["/imovel/", "/apartamento", "chavesnamao.com.br"]
      : portal === "imovelweb"
        ? ["/propriedades/"]
        : ["/imovel/", "/apartamento", "/propriedades/"];

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (!hrefHints.some((h) => href.includes(h))) return;
    if (/busca|filtro|login|cadastro|venda-/i.test(href)) return;
    // Imovelweb: só fichas de imóvel, não listagens de bairro.
    if (portal === "imovelweb" && !/\/propriedades\//i.test(href)) return;
    const abs = absUrl(href, pageUrl);
    if (seen.has(abs.toLowerCase())) return;
    const card = $(el).closest("article, li, div.card, div[data-id], div.result");
    const text = (card.length ? card.text() : $(el).text())
      .replace(/\s+/g, " ")
      .trim();
    const price = text.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
    const rooms = text.match(/(\d+)\s*(?:quarto|quartos|dorm)/i);
    const area = text.match(/(\d+)\s*m²/i);
    const vagas = text.match(/(\d+)\s*vaga/i);
    const street =
      text.match(
        /((?:Rua|R\.|Av\.?|Avenida|Alameda)\s+[A-Za-zÀ-ÿ0-9\s.'\-]{3,60}(?:,\s*\d+)?)/i
      ) ||
      // títulos Chaves na Mão: "na Rua X, 123, Bairro"
      text.match(
        /\bna\s+((?:Rua|R\.|Av\.?|Avenida|Alameda)\s+[A-Za-zÀ-ÿ0-9\s.'\-]{3,60},\s*\d+)/i
      );
    const bairroMatch = text.match(
      /(?:,\s*)([A-Za-zÀ-ÿ\s]{3,40}),\s*São Paulo/i
    );
    const aluguel = price ? parseBRLNumber(price[1]) || 0 : 0;
    if (aluguel <= 0) return;
    const bairro = bairroMatch?.[1]?.trim() || "";
    const streetTxt = street?.[1]?.trim();
    push(
      toPortalListing({
        titulo: text.slice(0, 90) || `Anúncio ${PORTAL_LABELS[portal]}`,
        endereco: streetTxt
          ? [streetTxt, bairro, "São Paulo - SP"].filter(Boolean).join(", ")
          : bairro
            ? `${bairro}, São Paulo - SP`
            : "São Paulo - SP",
        bairro,
        aluguel,
        condominio: 0,
        iptu: 0,
        quartos: rooms ? Number(rooms[1]) : 0,
        vagas: vagas ? Number(vagas[1]) : undefined,
        areaM2: area ? Number(area[1]) : undefined,
        portaria24h: /portaria\s*24|24\s*h/i.test(text),
        linkAnuncio: abs,
        portal,
      })
    );
  });

  return out;
}

/** Chaves na Mão / Imovelweb: abre a busca, espera cards, rola e extrai. */
export async function scrapeHtmlSearchPage(
  url: string,
  portalRaw: string,
  opts?: { mode?: PlaywrightMode; browser?: Browser }
): Promise<PortalListing[]> {
  const portal = normalizePortalId(portalRaw);
  if (!portal) return [];

  const browser = opts?.browser || (await getSharedBrowser(opts?.mode || "headed"));
  const page = await newStealthPage(browser);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    const selectors =
      portal === "chavesnamao"
        ? ["a[href*='/imovel']", "a[href*='apartamento']", "[data-testid]"]
        : [
            "a[href*='/propriedades']",
            "a[href*='apartamento']",
            "article",
            ".postings-container",
          ];
    for (const sel of selectors) {
      try {
        await page.waitForSelector(sel, { timeout: 8000 });
        break;
      } catch {
        // try next
      }
    }
    await page.waitForTimeout(1500);
    await autoScroll(page, 8);
    const html = await page.content();
    return extractFromHtmlPortals(html, portal, url);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}

function pricesFromCardText(cardText: string): {
  condominio: number;
  iptu: number;
} {
  const prices = Array.from(cardText.matchAll(/R\$\s*([\d.]+)/g)).map((m) =>
    parseBRLNumber(m[1])
  );
  const nums = prices.filter((n): n is number => n != null && n > 0);
  // Heurística: 1º = aluguel (já no slug), 2º condomínio, 3º IPTU
  return {
    condominio: nums.length >= 2 ? nums[1] || 0 : 0,
    iptu: nums.length >= 3 ? nums[2] || 0 : 0,
  };
}

function bairroFromOlxSlug(slug: string): string {
  // …-com-piscina-perdizes-zona-oeste-… → "Perdizes"
  const beforeZona = slug.match(
    /-([a-z0-9-]+)-zona-(?:oeste|leste|norte|sul|centro)/i
  );
  if (beforeZona) {
    const parts = beforeZona[1].split("-").filter(Boolean);
    const last = parts[parts.length - 1] || "";
    if (last) return last.charAt(0).toUpperCase() + last.slice(1);
  }
  const m = slug.match(
    /(?:quartos?|quarto)-([a-z0-9-]+?)-(?:sao-paulo|com-|\d+m2)/i
  );
  const raw = (m?.[1] || "").split("-").filter(Boolean).pop() || "";
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "";
}

/**
 * Extrai anúncios do HTML do Viva Real a partir dos links /imovel/…-aluguel-RS…-id-….
 * Funciona mesmo sem Glue /v2/listings (bloqueado pelo CF no Chromium).
 */
export function extractVivaListingsFromHtml(
  html: string,
  pageUrl: string
): PortalListing[] {
  const $ = cheerio.load(html);
  const out: PortalListing[] = [];
  const seen = new Set<string>();

  $('a[href*="/imovel/"][href*="-id-"]').each((_, el) => {
    const href = String($(el).attr("href") || "");
    const link = absUrl(href, pageUrl).split("?")[0];
    if (!/\/imovel\/.+-id-\d+/i.test(link)) return;
    if (/ERROR_PAGE|showcase/i.test(href)) return;
    const k = link.toLowerCase();
    if (seen.has(k)) return;

    const slug = link.split("/imovel/")[1] || "";
    const roomsMatch = slug.match(/(\d+)-quartos?/i);
    const areaMatch = slug.match(/(\d+)m2/i);
    const rentMatch = slug.match(/aluguel-RS(\d+)/i);
    const idMatch = slug.match(/id-(\d+)/i);
    const aluguel = rentMatch ? Number(rentMatch[1]) : 0;
    if (!aluguel || !idMatch) return;

    const bairro = bairroFromOlxSlug(slug) || "Perdizes";
    const card = $(el).closest(
      "article, li, [data-type], .property-card, .listing-card, div"
    );
    const { condominio, iptu } = pricesFromCardText(
      card.text().replace(/\s+/g, " ").trim()
    );

    seen.add(k);
    out.push({
      id: idMatch[1],
      titulo:
        card.find("h2, h3, [class*='title']").first().text().trim() ||
        `Apartamento ${roomsMatch?.[1] || "?"} qtos — ${bairro}`,
      endereco: `${bairro}, São Paulo - SP`,
      bairro,
      aluguel,
      condominio,
      iptu,
      quartos: roomsMatch ? Number(roomsMatch[1]) : 0,
      vagas: /com-garagem/i.test(slug) ? 1 : undefined,
      areaM2: areaMatch ? Number(areaMatch[1]) : undefined,
      portaria24h: false,
      linkAnuncio: link.startsWith("http")
        ? link
        : `https://www.vivareal.com.br${link}`,
      portal: "vivareal",
      portalLabel: PORTAL_LABELS.vivareal,
    });
  });

  return out;
}

/**
 * ZAP Imóveis: links /imovel/aluguel-apartamento-N-quartos-…-Xm2-id-….
 * URL de busca precisa incluir a zona (`sp+sao-paulo+zona-oeste+perdizes`),
 * senão o site devolve ERROR_PAGE / “página não disponível”.
 */
export function extractZapListingsFromHtml(
  html: string,
  pageUrl: string
): PortalListing[] {
  const $ = cheerio.load(html);
  const out: PortalListing[] = [];
  const seen = new Set<string>();

  $('a[href*="/imovel/"][href*="-id-"]').each((_, el) => {
    const href = String($(el).attr("href") || "");
    if (/ERROR_PAGE|showcase/i.test(href)) return;
    const link = absUrl(href, pageUrl).split("?")[0];
    if (!/\/imovel\/aluguel-.+-id-\d+/i.test(link)) return;
    const k = link.toLowerCase();
    if (seen.has(k)) return;

    const slug = link.split("/imovel/")[1] || "";
    const roomsMatch = slug.match(/(\d+)-quartos?/i);
    const areaMatch = slug.match(/(\d+)m2/i);
    const idMatch = slug.match(/id-(\d+)/i);
    if (!idMatch) return;

    const card = $(el).closest(
      "article, li, [data-type], .property-card, .listing-card, div"
    );
    const cardText = card.text().replace(/\s+/g, " ").trim();
    const { condominio, iptu } = pricesFromCardText(cardText);
    const rentFromCard = Array.from(cardText.matchAll(/R\$\s*([\d.]+)/g))
      .map((m) => parseBRLNumber(m[1]))
      .find((n) => n != null && n >= 800);
    const aluguel = rentFromCard ?? 0;
    if (!aluguel) return;

    const bairro = bairroFromOlxSlug(slug) || "Perdizes";
    seen.add(k);
    out.push({
      id: idMatch[1],
      titulo:
        card.find("h2, h3, [class*='title']").first().text().trim() ||
        `Apartamento ${roomsMatch?.[1] || "?"} qtos — ${bairro}`,
      endereco: `${bairro}, São Paulo - SP`,
      bairro,
      aluguel,
      condominio,
      iptu,
      quartos: roomsMatch ? Number(roomsMatch[1]) : 0,
      vagas: /vaga|garagem/i.test(slug + cardText) ? 1 : undefined,
      areaM2: areaMatch ? Number(areaMatch[1]) : undefined,
      portaria24h: false,
      linkAnuncio: link.startsWith("http")
        ? link
        : `https://www.zapimoveis.com.br${link}`,
      portal: "zapimoveis",
      portalLabel: PORTAL_LABELS.zapimoveis,
    });
  });

  return out;
}

/** Paginação por URL: ZAP/Viva `?pagina=N`; Imovelweb `-pagina-N.html`. */
export function buildPortalPagedUrl(
  url: string,
  portal: "vivareal" | "zapimoveis" | "imovelweb",
  page: number
): string {
  if (page <= 1) return url;
  if (portal === "imovelweb") {
    if (/[-_]pagina-\d+/i.test(url)) {
      return url.replace(/([-_]pagina-)\d+/i, `$1${page}`);
    }
    return url.replace(/(\.html)(\?|$)/i, `-pagina-${page}$1$2`);
  }
  try {
    const u = new URL(url);
    u.searchParams.set("pagina", String(page));
    return u.toString();
  } catch {
    const sep = url.includes("?") ? "&" : "?";
    return `${url}${sep}pagina=${page}`;
  }
}

function mergeListings(
  into: PortalListing[],
  batch: PortalListing[],
  seen: Set<string>
): number {
  let added = 0;
  for (const item of batch) {
    const k = item.linkAnuncio.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    into.push(item);
    added += 1;
  }
  return added;
}

async function scrapeOlxFamilyFirefox(
  url: string,
  portal: "vivareal" | "zapimoveis",
  opts?: { browser?: Browser; scrollSteps?: number; maxPages?: number }
): Promise<PortalListing[]> {
  const browser = opts?.browser || (await getSharedFirefoxBrowser());
  const page = await browser.newPage({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    viewport: { width: 1440, height: 900 },
  });
  const maxPages = Math.max(1, opts?.maxPages ?? 8);
  const steps = opts?.scrollSteps ?? 5;
  const seen = new Set<string>();
  const out: PortalListing[] = [];

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const pageUrl = buildPortalPagedUrl(url, portal, pageNum);
      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await page.waitForTimeout(pageNum === 1 ? 8000 : 4500);
      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(450);
      }
      await page.waitForTimeout(1000);

      const title = await page.title().catch(() => "");
      const html = await page.content();
      if (
        /attention required|just a moment|um momento|you have been blocked/i.test(
          `${title} ${html.slice(0, 2500)}`
        )
      ) {
        break;
      }
      if (/não está mais disponível|ERROR_PAGE/i.test(html.slice(0, 8000))) {
        break;
      }

      const batch =
        portal === "zapimoveis"
          ? extractZapListingsFromHtml(html, pageUrl)
          : extractVivaListingsFromHtml(html, pageUrl);
      const added = mergeListings(out, batch, seen);
      if (added === 0) break;
    }
  } catch {
    // page errors
  } finally {
    await page.close().catch(() => undefined);
  }
  return out;
}

/** Viva Real via Firefox — várias páginas (`?pagina=N`). */
export async function scrapeVivaRealFirefox(
  url: string,
  opts?: { browser?: Browser; scrollSteps?: number; maxPages?: number }
): Promise<PortalListing[]> {
  return scrapeOlxFamilyFirefox(url, "vivareal", opts);
}

/**
 * ZAP Imóveis via Firefox + URL com zona
 * (`sp+sao-paulo+zona-oeste+perdizes`, sem `++`) — paginação `?pagina=N`.
 */
export async function scrapeZapFirefox(
  url: string,
  opts?: { browser?: Browser; scrollSteps?: number; maxPages?: number }
): Promise<PortalListing[]> {
  return scrapeOlxFamilyFirefox(url, "zapimoveis", opts);
}

async function waitOutImovelwebTurnstile(
  page: import("playwright").Page
): Promise<boolean> {
  for (let i = 0; i < 20; i++) {
    await page.waitForTimeout(3000);
    const title = await page.title().catch(() => "");
    for (const frame of page.frames()) {
      const fu = frame.url();
      if (!/turnstile|challenge|cloudflare/i.test(fu)) continue;
      try {
        await frame.locator("body").click({ timeout: 1000 });
        await frame.locator("input").first().click({ timeout: 1000 });
      } catch {
        // ignore
      }
    }
    if (!/um momento|just a moment|verifica/i.test(title)) return true;
  }
  const title = await page.title().catch(() => "");
  return !/um momento|just a moment|attention required|blocked/i.test(title);
}

/**
 * Imovelweb via Firefox + SCRAPE_PROXY_URL (residencial).
 * Turnstile na 1ª página; demais via `-pagina-N.html`.
 */
export async function scrapeImovelwebFirefox(
  url: string,
  opts?: { browser?: Browser; scrollSteps?: number; maxPages?: number }
): Promise<PortalListing[]> {
  if (!scrapeProxyServer()) {
    return [];
  }
  const browser = opts?.browser || (await getSharedFirefoxBrowser());
  const page = await browser.newPage({
    locale: "pt-BR",
    userAgent:
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:133.0) Gecko/20100101 Firefox/133.0",
    viewport: { width: 1440, height: 900 },
  });
  const maxPages = Math.max(1, opts?.maxPages ?? 8);
  const steps = opts?.scrollSteps ?? 5;
  const seen = new Set<string>();
  const out: PortalListing[] = [];

  try {
    for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
      const pageUrl = buildPortalPagedUrl(url, "imovelweb", pageNum);
      await page.goto(pageUrl, {
        waitUntil: "domcontentloaded",
        timeout: 90000,
      });
      if (pageNum === 1) {
        const ok = await waitOutImovelwebTurnstile(page);
        if (!ok) break;
      } else {
        await page.waitForTimeout(4000);
        const title = await page.title().catch(() => "");
        if (/um momento|just a moment|verifica/i.test(title)) {
          const ok = await waitOutImovelwebTurnstile(page);
          if (!ok) break;
        }
      }

      for (let i = 0; i < steps; i++) {
        await page.mouse.wheel(0, 1600);
        await page.waitForTimeout(450);
      }
      await page.waitForTimeout(1000);
      const html = await page.content();
      const batch = extractFromHtmlPortals(html, "imovelweb", pageUrl);
      const added = mergeListings(out, batch, seen);
      if (added === 0) break;
    }
  } catch {
    // page errors
  } finally {
    await page.close().catch(() => undefined);
  }
  return out;
}

export function buildPortalSearchUrls(
  neigh: string,
  opts: { rooms: number; priceBand: SearchPriceBand }
): Array<{ portal: PortalId; url: string }> {
  const { rooms, priceBand } = opts;
  const min = priceBand.min;
  const max = priceBand.max ?? 20000;
  const all: Array<{ portal: PortalId; url: string }> = [
    {
      portal: "quintoandar",
      url:
        `https://www.quintoandar.com.br/alugar/imovel/${neigh}-sao-paulo-sp-brasil/apartamento` +
        `/de-${min}-a-${max}/de-${rooms}-a-${rooms}-quartos`,
    },
    {
      portal: "chavesnamao",
      url:
        `https://www.chavesnamao.com.br/apartamentos-para-alugar/sp-sao-paulo/${neigh}/` +
        `?valorMin=${min}&valorMax=${max}&quartos=${rooms}`,
    },
    {
      portal: "vivareal",
      url:
        `https://www.vivareal.com.br/aluguel/sp/sao-paulo/zona-oeste/${neigh}/apartamento_residencial/` +
        `?precoMaximo=${max}&precoMinimo=${min}&quartos=${rooms}`,
    },
    {
      portal: "zapimoveis",
      // Formato antigo `sp+sao-paulo++perdizes` devolve ERROR_PAGE.
      url:
        `https://www.zapimoveis.com.br/aluguel/apartamentos/sp+sao-paulo+zona-oeste+${neigh}/` +
        `${rooms}-quartos/?transacao=aluguel&tipos=apartamento_residencial&quartos=${rooms}&precoMaximo=${max}`,
    },
    {
      portal: "imovelweb",
      url:
        `https://www.imovelweb.com.br/apartamentos-aluguel-${neigh}-sao-paulo.html` +
        `?precio-maximo=${max}&precio-minimo=${min}&ambientes=${rooms}`,
    },
  ];
  const active = new Set<PortalId>([
    ...SCRAPE_ACTIVE_PORTALS,
    ...(scrapeProxyServer() ? (["imovelweb"] as const) : []),
  ]);
  return all.filter((item) => active.has(item.portal));
}

function houseFromQuintoApi(src: Record<string, unknown>): PortalListing | null {
  const id = src.id ?? src.houseId;
  if (id == null) return null;
  const aluguel = pickNum(src.rent, src.rentPrice) ?? 0;
  if (aluguel <= 0) return null;
  const condoIptu = pickNum(src.iptuPlusCondominium, src.condoIptu) ?? 0;
  const street =
    typeof src.address === "string"
      ? src.address
      : pickStr(
          (src.address as Record<string, unknown> | undefined)?.address,
          (src.address as Record<string, unknown> | undefined)?.street
        );
  const bairro =
    pickStr(src.neighbourhood, src.neighborhood, src.regionName) || "";
  const amenities = Array.isArray(src.amenities)
    ? src.amenities.map(String).join(" ")
    : "";
  const installations = Array.isArray(src.installations)
    ? src.installations.map(String).join(" ")
    : "";
  return {
    id: String(id),
    titulo:
      pickStr(src.shortRentDescription, src.title) ||
      `Apartamento ${pickNum(src.bedrooms) || "?"} qtos — ${bairro || "SP"}`,
    endereco: [street, bairro, "São Paulo - SP"].filter(Boolean).join(", "),
    bairro,
    aluguel,
    condominio: condoIptu,
    iptu: 0,
    quartos: pickNum(src.bedrooms, src.rooms) || 0,
    vagas: pickNum(src.parkingSpaces, src.parkingSpots),
    areaM2: pickNum(src.area, src.areaM2),
    portaria24h: /PORTARIA_24|portaria\s*24|doorman/i.test(
      `${amenities} ${installations}`
    ),
    linkAnuncio: `https://www.quintoandar.com.br/imovel/${id}`,
    portal: "quintoandar",
    portalLabel: PORTAL_LABELS.quintoandar,
  };
}

/**
 * QuintoAndar: abre a busca, intercepta /v3/search/list e clica "Ver mais"
 * até esgotar ou atingir maxClicks.
 */
export async function scrapeQuintoAndarPaginated(
  url: string,
  opts?: { mode?: PlaywrightMode; maxClicks?: number; browser?: Browser }
): Promise<PortalListing[]> {
  const browser = opts?.browser || (await getSharedBrowser(opts?.mode || "headed"));
  const page = await newStealthPage(browser);
  const seen = new Set<string>();
  const out: PortalListing[] = [];
  const maxClicks = opts?.maxClicks ?? 25;

  const ingest = (payload: unknown) => {
    const root = payload as {
      hits?: { hits?: Array<{ _source?: Record<string, unknown> }> };
    };
    const hits = root?.hits?.hits;
    if (!Array.isArray(hits)) return;
    for (const hit of hits) {
      const src = hit?._source;
      if (!src) continue;
      const item = houseFromQuintoApi(src);
      if (!item) continue;
      const k = item.linkAnuncio.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(item);
    }
  };

  const onResponse = async (response: import("playwright").Response) => {
    try {
      const u = response.url();
      if (!u.includes("house-listing-search") || !u.includes("/search/list")) {
        return;
      }
      if (!response.ok()) return;
      ingest(await response.json());
    } catch {
      // ignore
    }
  };

  page.on("response", onResponse);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2500);

    // SSR __NEXT_DATA__ houses
    const html = await page.content();
    const $ = cheerio.load(html);
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
            const item = houseFromQuintoApi({ ...house, id: house.id ?? id });
            if (!item) continue;
            const k = item.linkAnuncio.toLowerCase();
            if (seen.has(k)) continue;
            seen.add(k);
            out.push(item);
          }
        }
      } catch {
        // ignore
      }
    }

    for (let i = 0; i < maxClicks; i++) {
      const before = out.length;
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button")).find(
          (b) => {
            const label = (b.getAttribute("aria-label") || "").trim();
            const text = (b.textContent || "").replace(/\s+/g, " ").trim();
            return label === "Ver mais" || /^Ver mais$/i.test(text);
          }
        );
        if (!btn || btn.disabled) return false;
        btn.scrollIntoView({ block: "center" });
        btn.click();
        return true;
      });
      if (!clicked) break;
      await page.waitForTimeout(2200);
      if (out.length === before) {
        // API pode ter demorado
        await page.waitForTimeout(1500);
        if (out.length === before) break;
      }
    }
  } catch {
    // page errors
  } finally {
    page.off("response", onResponse);
    await page.close().catch(() => undefined);
  }
  return out;
}

/**
 * Chaves na Mão: rola + clica "Ver mais imóveis" até acabar; extrai DOM/JSON-LD.
 */
export async function scrapeChavesPaginated(
  url: string,
  opts?: { mode?: PlaywrightMode; maxClicks?: number; browser?: Browser }
): Promise<PortalListing[]> {
  const browser = opts?.browser || (await getSharedBrowser(opts?.mode || "headed"));
  const page = await newStealthPage(browser);
  const maxClicks = opts?.maxClicks ?? 15;
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
    await page.waitForTimeout(2000);
    try {
      await page.waitForSelector('a[href*="/imovel"]', { timeout: 10000 });
    } catch {
      // continue anyway
    }
    await autoScroll(page, 4);

    for (let i = 0; i < maxClicks; i++) {
      const before = await page.$$eval('a[href*="/imovel"]', (as) => as.length);
      const clicked = await page.evaluate(() => {
        const btn = Array.from(document.querySelectorAll("button, a")).find(
          (e) =>
            /^Ver mais imóveis$/i.test(
              (e.textContent || "").replace(/\s+/g, " ").trim()
            )
        );
        if (!btn) return false;
        (btn as HTMLElement).scrollIntoView({ block: "center" });
        (btn as HTMLElement).click();
        return true;
      });
      if (!clicked) break;
      await page.waitForTimeout(2500);
      const after = await page.$$eval('a[href*="/imovel"]', (as) => as.length);
      if (after <= before) break;
      await autoScroll(page, 2);
    }

    const html = await page.content();
    return extractFromHtmlPortals(html, "chavesnamao", url);
  } catch {
    return [];
  } finally {
    await page.close().catch(() => undefined);
  }
}
