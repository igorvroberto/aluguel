/**
 * Busca paradas/estações reais perto de um ponto via Google Places
 * (mesmo catálogo do Maps), para hubs de transporte.
 */

export type PlaceTransitHub = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  kinds: string[];
};

interface PlacesNewResponse {
  places?: Array<{
    id?: string;
    displayName?: { text?: string };
    location?: { latitude?: number; longitude?: number };
    types?: string[];
  }>;
  error?: { message?: string };
}

interface PlacesLegacyResponse {
  results?: Array<{
    place_id?: string;
    name?: string;
    geometry?: { location?: { lat?: number; lng?: number } };
    types?: string[];
  }>;
  status?: string;
  error_message?: string;
}

function dedupeHubs(hubs: PlaceTransitHub[]): PlaceTransitHub[] {
  const seen = new Set<string>();
  const out: PlaceTransitHub[] = [];
  for (const h of hubs) {
    const key = `${h.lat.toFixed(5)},${h.lng.toFixed(5)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(h);
  }
  return out;
}

async function searchNearbyNew(
  apiKey: string,
  lat: number,
  lng: number,
  radiusM: number,
  includedTypes: string[]
): Promise<PlaceTransitHub[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchNearby", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "places.id,places.displayName,places.location,places.types",
    },
    body: JSON.stringify({
      includedTypes,
      maxResultCount: 15,
      languageCode: "pt-BR",
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: radiusM,
        },
      },
    }),
    signal: AbortSignal.timeout(12000),
  });
  const data = (await res.json()) as PlacesNewResponse;
  if (!res.ok) {
    throw new Error(data.error?.message || `Places New HTTP ${res.status}`);
  }
  return (data.places || [])
    .map((p) => {
      const plat = p.location?.latitude;
      const plng = p.location?.longitude;
      if (plat == null || plng == null) return null;
      return {
        id: p.id || `${plat},${plng}`,
        name: p.displayName?.text || "Parada",
        lat: plat,
        lng: plng,
        kinds: p.types || includedTypes,
      } satisfies PlaceTransitHub;
    })
    .filter((h): h is PlaceTransitHub => h != null);
}

async function searchNearbyLegacy(
  apiKey: string,
  lat: number,
  lng: number,
  radiusM: number,
  type: string
): Promise<PlaceTransitHub[]> {
  const url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json` +
    `?location=${lat},${lng}&radius=${radiusM}&type=${type}&language=pt-BR&key=${apiKey}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const data = (await res.json()) as PlacesLegacyResponse;
  if (!res.ok || (data.status && data.status !== "OK" && data.status !== "ZERO_RESULTS")) {
    throw new Error(data.error_message || data.status || `Places legacy HTTP ${res.status}`);
  }
  return (data.results || [])
    .map((r) => {
      const plat = r.geometry?.location?.lat;
      const plng = r.geometry?.location?.lng;
      if (plat == null || plng == null) return null;
      return {
        id: r.place_id || `${plat},${plng}`,
        name: r.name || "Parada",
        lat: plat,
        lng: plng,
        kinds: r.types || [type],
      } satisfies PlaceTransitHub;
    })
    .filter((h): h is PlaceTransitHub => h != null);
}

/**
 * Paradas de ônibus + estações de metrô/trem perto de (lat,lng).
 * Tenta Places API (New); se falhar, Nearby Search legado.
 */
export async function fetchNearbyTransitPlaces(
  apiKey: string,
  lat: number,
  lng: number,
  radiusM = 1000
): Promise<PlaceTransitHub[]> {
  try {
    const hubs = await searchNearbyNew(apiKey, lat, lng, radiusM, [
      "bus_station",
      "transit_station",
      "subway_station",
      "light_rail_station",
    ]);
    return dedupeHubs(hubs);
  } catch (err) {
    console.warn("Places New falhou, tentando legacy:", err);
  }

  const [bus, transit, subway] = await Promise.all([
    searchNearbyLegacy(apiKey, lat, lng, radiusM, "bus_station").catch(() => []),
    searchNearbyLegacy(apiKey, lat, lng, radiusM, "transit_station").catch(() => []),
    searchNearbyLegacy(apiKey, lat, lng, radiusM, "subway_station").catch(() => []),
  ]);
  return dedupeHubs([...bus, ...transit, ...subway]);
}
