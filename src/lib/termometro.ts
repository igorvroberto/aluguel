/**
 * Cliente da API pública do Termômetro (https://termometro.app/api).
 * Fonte agregada — hoje principalmente QuintoAndar, sem Cloudflare na nossa ponta.
 */

import { DESTINATION, DEFAULT_MAX_PACKAGE } from "./constants";
import { normalizePortalId } from "./portals";
import type { Apartment } from "./types";

const BASE = "https://termometro.app/api/v1";
const UA = "ImoveisRadar/0.1 (+https://radar.liganer.com.br; termometro-import)";

export interface TermometroAnuncio {
  id: string;
  fonte: string;
  url: string;
  tipo: string;
  tipo_imovel?: string;
  preco: number;
  condominio?: number | null;
  iptu?: number | null;
  custo_mensal?: number | null;
  area_m2?: number | null;
  quartos?: number | null;
  vagas?: number | null;
  endereco?: string | null;
  bairro?: string | null;
  cidade?: string | null;
  local?: { lat?: number; lng?: number; precisao?: string } | null;
  condominio_nome?: string | null;
  historico?: { visto_ultima_vez?: string | null } | null;
}

export interface TermometroFetchOptions {
  lat?: number;
  lng?: number;
  /** metros, 50–5000 (API). */
  raio?: number;
  bairros?: string[];
  custoMax?: number;
  quartosMin?: number;
  vagasMin?: number;
  /** itens por página (máx 200). */
  limite?: number;
  /** páginas máximas por consulta (lat/bairro). */
  maxPages?: number;
}

export interface TermometroFetchResult {
  anuncios: TermometroAnuncio[];
  requests: number;
  warnings: string[];
}

const DEFAULT_BAIRROS = [
  "Perdizes",
  "Pompéia",
  "Água Branca",
  "Barra Funda",
  "Santa Cecília",
  "Higienópolis",
  "Sumaré",
  "Vila Madalena",
];

async function fetchAnunciosPage(
  params: URLSearchParams
): Promise<{
  dados: TermometroAnuncio[];
  proximo: string | null;
  total: number;
}> {
  const url = `${BASE}/anuncios?${params.toString()}`;
  const res = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": UA,
    },
    signal: AbortSignal.timeout(25000),
    cache: "no-store",
  });
  if (res.status === 429) {
    const retry = res.headers.get("Retry-After") || "?";
    throw new Error(`Termômetro rate limit (429). Retry-After: ${retry}s`);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `Termômetro HTTP ${res.status}${body ? `: ${body.slice(0, 200)}` : ""}`
    );
  }
  const json = (await res.json()) as {
    dados?: TermometroAnuncio[];
    total?: number;
    pagina?: { proximo?: string | null };
  };
  return {
    dados: Array.isArray(json.dados) ? json.dados : [],
    proximo: json.pagina?.proximo ?? null,
    total: Number(json.total) || 0,
  };
}

async function fetchQueryAll(
  base: Record<string, string>,
  maxPages: number
): Promise<{ anuncios: TermometroAnuncio[]; requests: number }> {
  const out: TermometroAnuncio[] = [];
  let cursor: string | null = null;
  let requests = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const params = new URLSearchParams(base);
    if (cursor) params.set("cursor", cursor);
    const { dados, proximo } = await fetchAnunciosPage(params);
    requests += 1;
    out.push(...dados);
    if (!proximo || dados.length === 0) break;
    cursor = proximo;
    // Evita estourar o teto de consultas amplas (20/min).
    await new Promise((r) => setTimeout(r, 350));
  }

  return { anuncios: out, requests };
}

/** Busca anúncios de aluguel próximos ao destino / bairros-alvo. */
export async function fetchTermometroAnuncios(
  opts: TermometroFetchOptions = {}
): Promise<TermometroFetchResult> {
  const lat = opts.lat ?? DESTINATION.lat;
  const lng = opts.lng ?? DESTINATION.lng;
  const raio = Math.min(5000, Math.max(50, opts.raio ?? 2000));
  const custoMax = opts.custoMax ?? DEFAULT_MAX_PACKAGE;
  const quartosMin = opts.quartosMin ?? 2;
  const vagasMin = opts.vagasMin ?? 1;
  const limite = Math.min(200, Math.max(1, opts.limite ?? 100));
  const maxPages = Math.max(1, opts.maxPages ?? 3);
  const bairros = opts.bairros?.length ? opts.bairros : DEFAULT_BAIRROS;

  const warnings: string[] = [];
  const byId = new Map<string, TermometroAnuncio>();
  let requests = 0;

  const common: Record<string, string> = {
    tipo: "aluguel",
    tipo_imovel: "apartamento",
    situacao: "no_ar",
    custo_max: String(custoMax),
    quartos_min: String(quartosMin),
    vagas_min: String(vagasMin),
    ordem: "recentes",
    limite: String(limite),
  };

  try {
    const circle = await fetchQueryAll(
      {
        ...common,
        lat: String(lat),
        lng: String(lng),
        raio: String(raio),
      },
      maxPages
    );
    requests += circle.requests;
    for (const a of circle.anuncios) byId.set(a.id, a);
  } catch (err) {
    warnings.push(
      err instanceof Error ? err.message : "Falha na busca por raio."
    );
  }

  for (const bairro of bairros) {
    try {
      const page = await fetchQueryAll(
        { ...common, bairro, cidade: "sao-paulo" },
        Math.min(2, maxPages)
      );
      requests += page.requests;
      for (const a of page.anuncios) byId.set(a.id, a);
      await new Promise((r) => setTimeout(r, 400));
    } catch (err) {
      warnings.push(
        `${bairro}: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  return {
    anuncios: Array.from(byId.values()),
    requests,
    warnings,
  };
}

export function termometroToApartment(
  a: TermometroAnuncio
): Partial<Apartment> | null {
  const lat = Number(a.local?.lat);
  const lng = Number(a.local?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const aluguel = Number(a.preco) || 0;
  const condominio = Number(a.condominio) || 0;
  const iptu = Number(a.iptu) || 0;
  const rooms = Math.max(1, Number(a.quartos) || 1);
  const parking =
    a.vagas != null && Number.isFinite(Number(a.vagas))
      ? Number(a.vagas)
      : undefined;

  const street = (a.endereco || "").trim();
  const bairro = (a.bairro || "").trim();
  const address = [street, bairro, a.cidade || "São Paulo"]
    .filter(Boolean)
    .join(", ");

  const portal = normalizePortalId(a.fonte) || a.fonte || undefined;
  const title =
    street || bairro
      ? `Apartamento — ${street || bairro}`
      : `Apartamento ${a.id}`;

  const idSafe = a.id.replace(/[^a-zA-Z0-9:_-]+/g, "-");

  return {
    id: `tm-${idSafe}`,
    title,
    address,
    lat,
    lng,
    rooms,
    aluguel,
    condominio,
    iptu,
    portaria24h: false,
    externalUrl: a.url || "",
    areaM2: a.area_m2 != null ? Number(a.area_m2) : undefined,
    parkingSpots: parking,
    notes: [
      `termometro=${a.id}`,
      a.condominio_nome ? `predio=${a.condominio_nome}` : null,
      a.custo_mensal != null ? `custo_mensal=${a.custo_mensal}` : null,
    ]
      .filter(Boolean)
      .join(" | "),
    status: "Candidato",
    source: "termometro",
    portal,
    scrapedAt: a.historico?.visto_ultima_vez || new Date().toISOString(),
  };
}

export async function fetchTermometroApartments(
  opts: TermometroFetchOptions = {}
): Promise<{
  apartments: Array<Partial<Apartment>>;
  scanned: number;
  requests: number;
  warnings: string[];
  fontes: string[];
}> {
  const { anuncios, requests, warnings } = await fetchTermometroAnuncios(opts);
  const apartments: Array<Partial<Apartment>> = [];
  const fontes = new Set<string>();

  for (const a of anuncios) {
    const mapped = termometroToApartment(a);
    if (!mapped) continue;
    if (a.fonte) fontes.add(a.fonte);
    apartments.push(mapped);
  }

  return {
    apartments,
    scanned: anuncios.length,
    requests,
    warnings,
    fontes: Array.from(fontes),
  };
}
