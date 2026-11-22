import * as turf from "@turf/turf";
import {
  LINHA_LARANJA_ATIVAS,
  LINHA_LARANJA_COLOR,
  LINHA_VERMELHA,
  LINHA_VERMELHA_COLOR,
  METRO_STATIONS,
  type MetroStation,
} from "../../data/linhasMetro";

export interface LatLng {
  lat: number;
  lng: number;
}

export interface NearestStationResult {
  station: MetroStation;
  distanceMeters: number;
}

export function distanceMeters(a: LatLng, b: LatLng): number {
  return turf.distance(
    turf.point([a.lng, a.lat]),
    turf.point([b.lng, b.lat]),
    { units: "meters" }
  );
}

/** Estação mais próxima entre L3 + L6 ativas. */
export function nearestMetroStation(point: LatLng): NearestStationResult {
  let best: NearestStationResult | null = null;
  for (const station of METRO_STATIONS) {
    const d = distanceMeters(point, station);
    if (!best || d < best.distanceMeters) {
      best = { station, distanceMeters: d };
    }
  }
  return best!;
}

/** @deprecated use nearestMetroStation */
export function nearestLinhaVermelhaStation(
  point: LatLng
): NearestStationResult {
  return nearestMetroStation(point);
}

export function isWithinSelectedStations(
  point: LatLng,
  stationIds: string[],
  radiusMeters: number
): boolean {
  if (stationIds.length === 0) return true;
  const idSet = new Set(stationIds);
  return METRO_STATIONS.some(
    (s) => idSet.has(s.id) && distanceMeters(point, s) <= radiusMeters
  );
}

function buildLineGeoJSON(
  stations: MetroStation[],
  name: string,
  color: string
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        properties: { name, color },
        geometry: {
          type: "LineString",
          coordinates: stations.map((s) => [s.lng, s.lat]),
        },
      },
    ],
  };
}

function buildStationsGeoJSON(
  stations: MetroStation[]
): GeoJSON.FeatureCollection {
  return {
    type: "FeatureCollection",
    features: stations.map((s) => ({
      type: "Feature" as const,
      properties: {
        id: s.id,
        name: s.name,
        order: s.order,
        line: s.line,
        lineCode: s.lineCode,
        integration: s.integration ?? "",
        color: s.color,
      },
      geometry: {
        type: "Point" as const,
        coordinates: [s.lng, s.lat],
      },
    })),
  };
}

export function buildLinhaVermelhaLineGeoJSON(): GeoJSON.FeatureCollection {
  return buildLineGeoJSON(
    LINHA_VERMELHA,
    "Linha 3-Vermelha",
    LINHA_VERMELHA_COLOR
  );
}

export function buildLinhaVermelhaStationsGeoJSON(): GeoJSON.FeatureCollection {
  return buildStationsGeoJSON(LINHA_VERMELHA);
}

export function buildLinhaLaranjaLineGeoJSON(): GeoJSON.FeatureCollection {
  return buildLineGeoJSON(
    LINHA_LARANJA_ATIVAS,
    "Linha 6-Laranja (ativas)",
    LINHA_LARANJA_COLOR
  );
}

export function buildLinhaLaranjaStationsGeoJSON(): GeoJSON.FeatureCollection {
  return buildStationsGeoJSON(LINHA_LARANJA_ATIVAS);
}

/** Círculos de raio na cor da linha de cada estação selecionada. */
export function buildStationRadiusGeoJSON(
  stationIds: string[],
  radiusMeters: number
): GeoJSON.FeatureCollection {
  const idSet = new Set(stationIds);
  const features: GeoJSON.Feature[] = METRO_STATIONS.filter((s) =>
    idSet.has(s.id)
  ).map((s) => {
    const circle = turf.circle([s.lng, s.lat], radiusMeters, {
      steps: 64,
      units: "meters",
      properties: {
        id: s.id,
        name: s.name,
        radiusMeters,
        color: s.color,
        line: s.line,
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

export function formatMetroBadgeLabel(
  station: MetroStation,
  distanceMeters: number
): string {
  return `Metrô ${station.name} (${station.lineCode}) • ${formatMetroDistance(
    distanceMeters
  )}`;
}
