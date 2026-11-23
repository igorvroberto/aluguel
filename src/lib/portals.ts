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

export const PORTAL_OPTIONS = PORTAL_IDS.map((id) => ({
  id,
  label: PORTAL_LABELS[id],
}));

/** Bairros-alvo (L3/L6 + entorno) para busca nos portais. */
export const SEARCH_NEIGHBORHOODS = [
  "perdizes",
  "pompeia",
  "agua-branca",
  "barra-funda",
  "santa-cecilia",
  "higienopolis",
  "republica",
  "belem",
  "tatuape",
] as const;

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
