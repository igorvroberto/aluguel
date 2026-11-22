/**
 * Ajusta os imóveis seed (sem externalUrl): busca anúncio real no QuintoAndar
 * na mesma rua; se não achar, remove o seed fictício.
 */
import { config as loadEnv } from "dotenv";
import { promises as fs } from "fs";
import path from "path";
import * as cheerio from "cheerio";

loadEnv({ path: path.join(process.cwd(), ".env.local") });

const OUT = path.join(process.cwd(), "data", "apartments.json");
const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

type Apt = {
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
  status?: string;
  source?: string;
  notes?: string;
  [k: string]: unknown;
};

type QaHouse = {
  id: string;
  street: string;
  neighbourhood: string;
  rent: number;
  condoIptu: number;
  rooms: number;
  area?: number;
  lat?: number;
  lng?: number;
  title: string;
  url: string;
};

function norm(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(rua|r\.|av\.?|avenida|alameda)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function streetFromAddress(address: string): string {
  return address.split(",")[0]?.trim() || address;
}

function neighSlug(address: string): string {
  const parts = address.split("-").map((p) => p.trim());
  // "Rua X, 450 - Perdizes, São Paulo - SP"
  const mid = parts.find((p) =>
    /perdizes|barra funda|santa cec[ií]lia|rep[uú]blica|bel[eé]m|tatuap[eé]|vila buarque|pompeia|pomp[eé]ia/i.test(
      p
    )
  );
  const raw =
    mid?.split(",")[0]?.trim() ||
    address.match(
      /(Perdizes|Barra Funda|Santa Cecília|República|Belém|Tatuapé|Vila Buarque)/i
    )?.[1] ||
    "perdizes";
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

async function fetchQaNeighborhood(slug: string): Promise<QaHouse[]> {
  const url = `https://www.quintoandar.com.br/alugar/imovel/${slug}-sao-paulo-sp-brasil/apartamento`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": UA,
      "Accept-Language": "pt-BR,pt;q=0.9",
      Accept: "text/html",
    },
    signal: AbortSignal.timeout(20000),
  });
  const html = await res.text();
  const $ = cheerio.load(html);
  const raw = $("#__NEXT_DATA__").html();
  if (!raw) return [];
  try {
    const data = JSON.parse(raw) as {
      props?: {
        pageProps?: {
          initialState?: { houses?: Record<string, Record<string, unknown>> };
        };
      };
    };
    const houses = data.props?.pageProps?.initialState?.houses || {};
    const out: QaHouse[] = [];
    for (const [id, h] of Object.entries(houses)) {
      if (!h || h.forRent === false) continue;
      const addr = h.address as { address?: string } | undefined;
      const street = String(addr?.address || "");
      const rent = Number(h.rentPrice) || 0;
      if (!street || rent <= 0) continue;
      out.push({
        id: String(h.id ?? id),
        street,
        neighbourhood: String(h.neighbourhood || h.regionName || ""),
        rent,
        condoIptu: Number(h.condoIptu) || 0,
        rooms: Number(h.bedrooms) || 1,
        area: h.area != null ? Number(h.area) : undefined,
        title:
          String(h.shortRentDescription || "").slice(0, 120) ||
          `Apartamento — ${street}`,
        url: `https://www.quintoandar.com.br/imovel/${h.id ?? id}`,
      });
    }
    return out;
  } catch {
    return [];
  }
}

function scoreMatch(seed: Apt, house: QaHouse): number {
  const seedStreet = norm(streetFromAddress(seed.address));
  const houseStreet = norm(house.street);
  if (!seedStreet || !houseStreet) return -1;
  if (seedStreet !== houseStreet && !houseStreet.includes(seedStreet) && !seedStreet.includes(houseStreet)) {
    return -1;
  }
  let score = 100;
  score -= Math.abs(house.rooms - seed.rooms) * 15;
  score -= Math.min(80, Math.abs(house.rent - seed.aluguel) / 50);
  return score;
}

async function main() {
  const all = JSON.parse(await fs.readFile(OUT, "utf8")) as Apt[];
  const isSeed = (a: Apt) =>
    !(a.source === "scraping" || String(a.id).startsWith("apt-scrape"));

  const seeds = all.filter(isSeed);
  const kept = all.filter((a) => !isSeed(a));

  console.log(`[fix-seed] seeds=${seeds.length} scraped=${kept.length}`);

  const cache = new Map<string, QaHouse[]>();
  let updated = 0;
  let removed = 0;
  const result: Apt[] = [...kept];

  for (const seed of seeds) {
    const slug = neighSlug(seed.address);
    if (!cache.has(slug)) {
      console.log(`[fix-seed] fetch bairro ${slug}`);
      cache.set(slug, await fetchQaNeighborhood(slug));
      await new Promise((r) => setTimeout(r, 400));
    }
    const houses = cache.get(slug) || [];
    const ranked = houses
      .map((h) => ({ h, score: scoreMatch(seed, h) }))
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);

    const best = ranked[0]?.h;
    if (!best || (ranked[0]?.score ?? -1) < 40) {
      console.log(
        `[fix-seed] REMOVER ${seed.id} — sem anúncio real em ${streetFromAddress(seed.address)}`
      );
      removed += 1;
      continue;
    }

    // evita duplicar URL já presente nos scraped
    if (result.some((a) => a.externalUrl === best.url)) {
      console.log(
        `[fix-seed] REMOVER ${seed.id} — URL ${best.url} já existe`
      );
      removed += 1;
      continue;
    }

    const next: Apt = {
      ...seed,
      title: best.title || seed.title,
      address: `${best.street}${best.neighbourhood ? `, ${best.neighbourhood}` : ""}, São Paulo - SP`,
      rooms: best.rooms,
      aluguel: best.rent,
      condominio: best.condoIptu,
      iptu: 0,
      externalUrl: best.url,
      status: seed.status || "Candidato",
      source: "seed-matched",
      notes: `Ajustado da base antiga (${seed.id}) → anúncio real QuintoAndar`,
      scrapedAt: new Date().toISOString(),
    };
    console.log(
      `[fix-seed] OK ${seed.id} → ${best.url} (${best.street}, R$ ${best.rent})`
    );
    result.push(next);
    updated += 1;
  }

  await fs.writeFile(OUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(
    `[fix-seed] done total=${result.length} updated=${updated} removed=${removed}`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
