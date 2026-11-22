export interface ExtractedListing {
  title?: string;
  address?: string;
  aluguel?: number;
  condominio?: number;
  iptu?: number;
  areaM2?: number;
  rooms?: number;
  parkingSpots?: number;
  description?: string;
  source?: "url" | "text";
}

function decodeHtmlEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) =>
      String.fromCharCode(parseInt(n, 16))
    );
}

function stripTags(html: string): string {
  return decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  );
}

/** Parse Brazilian currency like R$ 2.800,00 or 2800 */
export function parseBRLNumber(raw: string): number | undefined {
  const cleaned = raw
    .replace(/R\$\s*/gi, "")
    .replace(/\s/g, "")
    .trim();
  if (!cleaned) return undefined;

  // 2.800,00 or 2800,00
  if (/^\d{1,3}(\.\d{3})+(,\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  // 2800.00 or 2800
  if (/^\d+(\.\d{1,2})?$/.test(cleaned) || /^\d+(,\d{1,2})?$/.test(cleaned)) {
    const n = Number(cleaned.replace(",", "."));
    return Number.isFinite(n) ? Math.round(n) : undefined;
  }
  const digits = cleaned.replace(/[^\d]/g, "");
  if (!digits) return undefined;
  const n = Number(digits);
  return Number.isFinite(n) ? n : undefined;
}

function metaContent(html: string, key: string): string | undefined {
  const patterns = [
    new RegExp(
      `<meta[^>]*(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["'][^>]*>`,
      "i"
    ),
    new RegExp(
      `<meta[^>]*content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["'][^>]*>`,
      "i"
    ),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m?.[1]) return decodeHtmlEntities(m[1].trim());
  }
  return undefined;
}

function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  const re =
    /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) {
    try {
      const parsed = JSON.parse(match[1].trim());
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // ignore malformed JSON-LD
    }
  }
  return blocks;
}

function walkJsonLd(
  node: unknown,
  visit: (obj: Record<string, unknown>) => void
): void {
  if (!node) return;
  if (Array.isArray(node)) {
    node.forEach((n) => walkJsonLd(n, visit));
    return;
  }
  if (typeof node === "object") {
    const obj = node as Record<string, unknown>;
    visit(obj);
    if (obj["@graph"]) walkJsonLd(obj["@graph"], visit);
  }
}

function fromJsonLd(blocks: unknown[]): Partial<ExtractedListing> {
  const out: Partial<ExtractedListing> = {};

  walkJsonLd(blocks, (obj) => {
    const type = String(obj["@type"] || "").toLowerCase();
    if (
      type.includes("apartment") ||
      type.includes("house") ||
      type.includes("residence") ||
      type.includes("product") ||
      type.includes("realestate") ||
      type.includes("offer") ||
      type.includes("place") ||
      type.includes("postaladdress")
    ) {
      if (!out.title && typeof obj.name === "string") out.title = obj.name;
      if (!out.description && typeof obj.description === "string") {
        out.description = obj.description;
      }

      const address = obj.address;
      if (typeof address === "string" && !out.address) {
        out.address = address;
      } else if (address && typeof address === "object") {
        const a = address as Record<string, unknown>;
        const parts = [
          a.streetAddress,
          a.addressLocality,
          a.addressRegion,
          a.postalCode,
        ]
          .filter((p) => typeof p === "string")
          .join(", ");
        if (parts && !out.address) out.address = parts;
      }

      const offers = obj.offers;
      if (offers && typeof offers === "object") {
        const offer = (
          Array.isArray(offers) ? offers[0] : offers
        ) as Record<string, unknown>;
        if (offer?.price != null && out.aluguel == null) {
          const price =
            typeof offer.price === "number"
              ? offer.price
              : parseBRLNumber(String(offer.price));
          if (price != null) out.aluguel = price;
        }
      }

      if (obj.floorSize && typeof obj.floorSize === "object") {
        const fs = obj.floorSize as Record<string, unknown>;
        const val =
          typeof fs.value === "number"
            ? fs.value
            : Number(String(fs.value || "").replace(",", "."));
        if (Number.isFinite(val) && out.areaM2 == null) out.areaM2 = val;
      }

      if (obj.numberOfRooms != null && out.rooms == null) {
        const rooms = Number(obj.numberOfRooms);
        if (Number.isFinite(rooms)) out.rooms = rooms;
      }
    }
  });

  return out;
}

function firstMatch(
  text: string,
  patterns: RegExp[]
): RegExpMatchArray | null {
  for (const p of patterns) {
    const m = text.match(p);
    if (m) return m;
  }
  return null;
}

function extractMoneyNear(
  text: string,
  labels: string[]
): number | undefined {
  for (const label of labels) {
    const re = new RegExp(
      `${label}\\s*[:\\-]?\\s*(?:de\\s+)?(?:R\\$\\s*)?([\\d.\\s]+(?:,\\d{2})?)`,
      "i"
    );
    const m = text.match(re);
    if (m?.[1]) {
      const n = parseBRLNumber(m[1]);
      if (n != null) return n;
    }
  }
  return undefined;
}

/** Extract listing fields from free-form ad text (Portuguese). */
export function extractFromText(text: string): ExtractedListing {
  const normalized = text.replace(/\u00a0/g, " ").replace(/\s+/g, " ").trim();
  const out: ExtractedListing = { source: "text", description: normalized };

  const addressMatch = firstMatch(normalized, [
    /(?:endere[cç]o|localiza[cç][aã]o|rua|av(?:enida)?|alameda|travessa)\s*[:\-]?\s*((?:Rua|R\.|Av\.?|Avenida|Alameda|Travessa)[^.\n|]{8,90})/i,
    /((?:Rua|R\.|Av\.?|Avenida|Alameda|Travessa)\s+[A-Za-zÀ-ÿ0-9\s.'\-]{3,60},?\s*\d{1,5}[^.\n|]{0,40})/i,
  ]);
  if (addressMatch?.[1]) {
    out.address = addressMatch[1].trim().replace(/\s+/g, " ");
  }

  out.aluguel = extractMoneyNear(normalized, [
    "aluguel",
    "valor do aluguel",
    "pre[cç]o",
    "locação",
    "loca[cç][aã]o",
    "rent",
  ]);

  // Prefer explicit rental keywords; avoid picking condo as rent
  if (out.aluguel == null) {
    const generic = normalized.match(/R\$\s*([\d.]+(?:,\d{2})?)/i);
    if (generic?.[1]) out.aluguel = parseBRLNumber(generic[1]);
  }

  out.condominio = extractMoneyNear(normalized, [
    "condom[ií]nio",
    "condo",
    "cond\\.",
  ]);
  out.iptu = extractMoneyNear(normalized, ["iptu"]);

  const areaMatch = firstMatch(normalized, [
    /(\d{2,4}(?:[.,]\d+)?)\s*m(?:²|2)\b/i,
    /[aá]rea(?:\s*(?:útil|util|total))?\s*[:\-]?\s*(\d{2,4}(?:[.,]\d+)?)/i,
  ]);
  if (areaMatch?.[1]) {
    const a = Number(areaMatch[1].replace(",", "."));
    if (Number.isFinite(a)) out.areaM2 = a;
  }

  const roomsMatch = firstMatch(normalized, [
    /(\d+)\s*(?:quarto|quartos|dorm(?:it[oó]rio)?s?|dorms?)\b/i,
    /(?:quarto|quartos|dorm(?:it[oó]rio)?s?)\s*[:\-]?\s*(\d+)/i,
  ]);
  if (roomsMatch?.[1]) out.rooms = Number(roomsMatch[1]);

  const parkingMatch = firstMatch(normalized, [
    /(\d+)\s*(?:vaga|vagas|garagem|estacionamento)/i,
    /(?:vaga|vagas|garagem)\s*[:\-]?\s*(\d+)/i,
  ]);
  if (parkingMatch?.[1]) out.parkingSpots = Number(parkingMatch[1]);

  // Title heuristic: first meaningful line or address
  const firstSentence = normalized.split(/[.!?|]/)[0]?.trim();
  if (firstSentence && firstSentence.length > 8 && firstSentence.length < 120) {
    out.title = firstSentence;
  } else if (out.address) {
    out.title = `Apartamento — ${out.address.split(",")[0]}`;
  }

  return out;
}

export function extractFromHtml(html: string, pageUrl?: string): ExtractedListing {
  const ogTitle = metaContent(html, "og:title");
  const ogDescription = metaContent(html, "og:description");
  const titleTag = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1];
  const jsonLd = fromJsonLd(extractJsonLdBlocks(html));
  const plain = stripTags(html);
  const fromText = extractFromText(
    [ogTitle, ogDescription, plain.slice(0, 12000)].filter(Boolean).join("\n")
  );

  const merged: ExtractedListing = {
    source: "url",
    title: jsonLd.title || ogTitle || fromText.title || (titleTag ? stripTags(titleTag) : undefined),
    address: jsonLd.address || fromText.address,
    aluguel: jsonLd.aluguel ?? fromText.aluguel,
    condominio: jsonLd.condominio ?? fromText.condominio,
    iptu: jsonLd.iptu ?? fromText.iptu,
    areaM2: jsonLd.areaM2 ?? fromText.areaM2,
    rooms: jsonLd.rooms ?? fromText.rooms,
    parkingSpots: jsonLd.parkingSpots ?? fromText.parkingSpots,
    description: ogDescription || fromText.description,
  };

  // Portal-specific cues in URL path / body
  if (!merged.address) {
    const streetInUrl = pageUrl?.match(
      /(?:rua|avenida|av)-([a-z0-9-]+)/i
    );
    if (streetInUrl) {
      merged.address = streetInUrl[1].replace(/-/g, " ");
    }
  }

  return merged;
}

export function isBlockedResponse(
  status: number,
  html: string
): boolean {
  if ([401, 403, 429, 503].includes(status)) return true;
  const lower = html.slice(0, 8000).toLowerCase();
  return (
    lower.includes("captcha") ||
    lower.includes("cf-browser-verification") ||
    lower.includes("access denied") ||
    lower.includes("bot detection") ||
    lower.includes("datadome") ||
    lower.includes("please enable javascript") ||
    lower.includes("unusual traffic")
  );
}

export function hasUsefulListingData(data: ExtractedListing): boolean {
  return Boolean(
    data.address ||
      data.aluguel != null ||
      data.rooms != null ||
      data.condominio != null
  );
}
