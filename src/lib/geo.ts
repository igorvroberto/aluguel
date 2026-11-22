import * as turf from "@turf/turf";
import {
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
  type LinhaVermelhaStation,
} from "../../data/linhaVermelha";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NearestStationResult {
  station: LinhaVermelhaStation;
  distanceMeters: number;
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  return turf.distance(
    turf.point([a.lng, a.lat]),
    turf.point([b.lng, b.lat]),
    { units: "meters" }
  );
}

export function nearestLinhaVermelhaStation(
  point: LatLng
): NearestStationResult {
  let best: NearestStationResult | null = null;
  for (const station of LINHA_VERMELHA) {
    const d = distanceMeters(point, station);
    if (!best || d < best.distanceMeters) {
      best = { station, distanceMeters: d };
    }
  }
  return best!;
}

/** Distância até cada estação (útil para filtros e debug). */
export function distancesToLinhaVermelha(
  point: LatLng
): Array<{ station: LinhaVermelhaStation; distanceMeters: number }> {
  return LINHA_VERMELHA.map((station) => ({
    station,
    distanceMeters: distanceMeters(point, station),
  }));
}

/**
 * true se nenhuma estação filtrada OU o ponto está a ≤ radius de
 * pelo menos uma das estações selecionadas.
 */
export function isWithinSelectedStations(
  point: LatLng,
  stationIds: string[],
  radiusMeters: number
): boolean {
  if (stationIds.length === 0) return true;
  const idSet = new Set(stationIds);
  return LINHA_VERMELHA.some(
    (s) => idSet.has(s.id) && distanceMeters(point, s) <= radiusMeters
  );
}

export function buildLinhaVermelhaLineGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: {
          name: "Linha 3-Vermelha",
          color: LINHA_VERMELHA_COLOR,
        },
        geometry: {
          type: "LineString",
          coordinates: LINHA_VERMELHA.map((s) => [s.lng, s.lat]),
        },
      },
    ],
  };
}

export function buildLinhaVermelhaStationsGeoJSON(): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: LINHA_VERMELHA.map((s) => ({
      type: "Feature" as const,
      properties: {
        id: s.id,
        name: s.name,
        order: s.order,
        integration: s.integration ?? "",
        color: LINHA_VERMELHA_COLOR,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [s.lng, s.lat],
      },
    })),
  };
}

/** Círculos (polígonos) de raio caminhável ao redor das estações selecionadas. */
export function buildStationRadiusGeoJSON(
  stationIds: string[],
  radiusMeters: number
): GeoJSON.FeatureCollection {
  const idSet = new Set(stationIds);
  const features: GeoJSON.Feature[] = LINHA_VERMELHA.filter((s) =>
    idSet.has(s.id)
  ).map((s) => {
    const circle = turf.circle([s.lng, s.lat], radiusMeters, {
      steps: 64,
      units: "meters",
      properties: {
        id: s.id,
        name: s.name,
        radiusMeters,
        color: LINHA_VERMELHA_COLOR,
      },
    });
    return circle as GeoJSON.Feature;
  });

  return { type: "FeatureCollection", features };
}

export function formatMetroDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)}m`;
  return `${(meters / 1000).toFixed(1).replace(".", ",")}km`;
}
