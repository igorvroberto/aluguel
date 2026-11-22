export interface GeocodeSuggestion {
  id: string;
  placeName: string;
  address: string;
  lng: number;
  lat: number;
}

interface GeocodingFeature {
  id: string;
  place_name: string;
  text: string;
  center: [number, number];
  place_type?: string[];
  context?: Array<{ id: string; text: string }>;
}

interface GeocodingResponse {
  features?: GeocodingFeature[];
  message?: string;
}

/** São Paulo city bbox (approx) + proximity to destination. */
const SP_BBOX = "-46.826,-23.78,-46.365,-23.356";
const PROXIMITY = "-46.66692,-23.53231";

export async function searchSaoPauloAddresses(
  token: string,
  query: string
): Promise<GeocodeSuggestion[]> {
  const trimmed = query.trim();
  if (trimmed.length < 3) return [];

  const url =
    `https://api.mapbox.com/geocoding/v5/mapbox.places/` +
    `${encodeURIComponent(trimmed)}.json` +
    `?access_token=${token}` +
    `&country=BR` +
    `&language=pt` +
    `&types=address,poi` +
    `&bbox=${SP_BBOX}` +
    `&proximity=${PROXIMITY}` +
    `&limit=6`;

  const res = await fetch(url);
  const data = (await res.json()) as GeocodingResponse;
  if (!res.ok || !data.features) {
    throw new Error(data.message || "Falha na geocodificação");
  }

  return data.features
    .filter((f) => {
      const ctx = (f.context || []).map((c) => c.text.toLowerCase()).join(" ");
      const place = f.place_name.toLowerCase();
      return (
        place.includes("são paulo") ||
        place.includes("sao paulo") ||
        ctx.includes("são paulo") ||
        ctx.includes("sao paulo")
      );
    })
    .map((f) => ({
      id: f.id,
      placeName: f.place_name,
      address: f.place_name,
      lng: f.center[0],
      lat: f.center[1],
    }));
}
