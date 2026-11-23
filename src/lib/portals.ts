/** Portais de anúncio suportados pelo scrape e pela UI. */

export const PORTAL_IDS = [
  "quintoandar",
  "zapimoveis",
  "vivareal",
  "chavesnamao",
  "imovelweb",
] as const;

export type PortalId = (typeof PORTAL_IDS)[number];

export const PORTAL_LABELS: Record<PortalId, string> = {
  quintoandar: "QuintoAndar",
  zapimoveis: "ZAP Imóveis",
  vivareal: "Viva Real",
  chavesnamao: "Chaves na Mão",
  imovelweb: "Imovelweb",
};

/**
 * Portais que o scrape tenta de verdade.
 * - Viva / ZAP: Firefox + URL correta (ZAP precisa de `zona-oeste` no path).
 * - Imovelweb: Turnstile interativo ainda bloqueia neste ambiente — fora.
 */
export const SCRAPE_ACTIVE_PORTALS: readonly PortalId[] = [
  "quintoandar",
  "chavesnamao",
  "vivareal",
  "zapimoveis",
] as const;

/** Opções do filtro de portal na UI (só portais ativos no scrape). */
export const PORTAL_FILTER_OPTIONS = SCRAPE_ACTIVE_PORTALS.map((id) => ({
  id,
  label: PORTAL_LABELS[id],
}));

/** @deprecated use PORTAL_FILTER_OPTIONS */
export const PORTAL_OPTIONS = PORTAL_FILTER_OPTIONS;

/** Bairros-alvo (polos L3/L6 ativas + entorno). */
export const SEARCH_NEIGHBORHOODS = [
  "perdizes",
  "pompeia",
  "agua-branca",
  "santa-marina",
  "freguesia-do-o",
  "barra-funda",
  "marechal-deodoro",
  "santa-cecilia",
  "higienopolis", // Higienópolis / Vila Buarque
  "republica",
  "belem",
  "tatuape",
] as const;

/** Faixas de preço mensal (aluguel) para fatiar buscas e furar teto da listagem. */
export const SEARCH_PRICE_BANDS = [
  { min: 1500, max: 2700, label: "1500-2700" },
  { min: 2701, max: 3400, label: "2701-3400" },
  { min: 3401, max: 4100, label: "3401-4100" },
  { min: 4101, max: null as number | null, label: "4101+" },
] as const;

export type SearchPriceBand = (typeof SEARCH_PRICE_BANDS)[number];

export function normalizePortalId(raw: string | undefined | null): PortalId | undefined {
  if (!raw) return undefined;
  const s = raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
  if (s.includes("quinto")) return "quintoandar";
  if (s.includes("zap")) return "zapimoveis";
  if (s.includes("viva")) return "vivareal";
  if (s.includes("chaves")) return "chavesnamao";
  if (s.includes("imovelweb") || s.includes("imovel")) return "imovelweb";
  if ((PORTAL_IDS as readonly string[]).includes(raw)) return raw as PortalId;
  return undefined;
}

export function portalLabel(raw: string | undefined | null): string {
  const id = normalizePortalId(raw);
  if (id) return PORTAL_LABELS[id];
  if (raw && /^manual$/i.test(raw.trim())) return "Manual";
  if (raw && raw.trim()) return raw.trim();
  return "Desconhecido";
}

/** Inferência a partir da URL do anúncio (útil para dados antigos). */
export function portalFromUrl(url: string | undefined | null): PortalId | undefined {
  if (!url) return undefined;
  const u = url.toLowerCase();
  if (u.includes("quintoandar.com")) return "quintoandar";
  if (u.includes("zapimoveis.com")) return "zapimoveis";
  if (u.includes("vivareal.com")) return "vivareal";
  if (u.includes("chavesnamao.com")) return "chavesnamao";
  if (u.includes("imovelweb.com")) return "imovelweb";
  return undefined;
}

export function resolveApartmentPortal(apt: {
  portal?: string;
  source?: string;
  externalUrl?: string;
  notes?: string;
}): PortalId | undefined {
  const fromField = normalizePortalId(apt.portal);
  if (fromField) return fromField;
  const noteMatch = apt.notes?.match(/portal=([a-z0-9_-]+)/i);
  if (noteMatch) {
    const fromNotes = normalizePortalId(noteMatch[1]);
    if (fromNotes) return fromNotes;
  }
  const fromSource = normalizePortalId(apt.source);
  if (fromSource) return fromSource;
  return portalFromUrl(apt.externalUrl);
}
