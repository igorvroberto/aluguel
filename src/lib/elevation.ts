import * as turf from "@turf/turf";
import type { Map as MapboxMap } from "mapbox-gl";
import {
  DESTINATION,
  GRADE_THRESHOLDS,
  SAMPLE_INTERVAL_METERS,
  TOPOGRAPHY_THRESHOLDS,
} from "./constants";
import type {
  ElevationPoint,
  RouteAnalysis,
  TopographyClass,
  WalkLegAnalysis,
} from "./types";

interface DirectionsResponse {
  routes?: Array<{
    distance: number;
    duration?: number;
    geometry: {
      coordinates: [number, number][];
    };
  }>;
  message?: string;
}

export function classifyTopography(
  elevationGain: number,
  maxGrade: number
): TopographyClass {
  const absMax = Math.abs(maxGrade);

  if (
    elevationGain > TOPOGRAPHY_THRESHOLDS.moderateGain ||
    absMax > TOPOGRAPHY_THRESHOLDS.moderateGrade
  ) {
    return "Ladeira Íngreme";
  }

  if (
    elevationGain <= TOPOGRAPHY_THRESHOLDS.flatGain &&
    absMax < TOPOGRAPHY_THRESHOLDS.flatGrade
  ) {
    return "Plano";
  }

  return "Inclinação Moderada";
}

export function resampleRoute(
  coordinates: [number, number][],
  intervalMeters = SAMPLE_INTERVAL_METERS
): [number, number][] {
  if (coordinates.length < 2) return coordinates;

  const line = turf.lineString(coordinates);
  const length = turf.length(line, { units: "meters" });
  const points: [number, number][] = [];

  for (let d = 0; d <= length; d += intervalMeters) {
    const pt = turf.along(line, d, { units: "meters" });
    const [lng, lat] = pt.geometry.coordinates;
    points.push([lng, lat]);
  }

  const last = coordinates[coordinates.length - 1];
  const prev = points[points.length - 1];
  if (!prev || prev[0] !== last[0] || prev[1] !== last[1]) {
    points.push(last);
  }

  return points;
}

export function extractElevations(
  map: MapboxMap,
  sampled: [number, number][]
): number[] {
  const elevations: number[] = [];
  let lastValid = 0;

  for (const [lng, lat] of sampled) {
    const elev = map.queryTerrainElevation({ lng, lat }, { exaggerated: false });
    if (elev == null || Number.isNaN(elev)) {
      elevations.push(lastValid);
    } else {
      lastValid = elev;
      elevations.push(elev);
    }
  }

  return elevations;
}

export function buildProfile(
  sampled: [number, number][],
  elevations: number[]
): {
  profile: ElevationPoint[];
  elevationGain: number;
  maxGrade: number;
  segmentGrades: number[];
} {
  const profile: ElevationPoint[] = [];
  const segmentGrades: number[] = [];
  let cumulative = 0;
  let elevationGain = 0;
  let maxGrade = 0;

  for (let i = 0; i < sampled.length; i++) {
    const [lng, lat] = sampled[i];
    const elevation = elevations[i] ?? 0;
    let grade = 0;

    if (i > 0) {
      const prev = sampled[i - 1];
      const segmentDist = turf.distance(
        turf.point(prev),
        turf.point([lng, lat]),
        { units: "meters" }
      );
      cumulative += segmentDist;
      const delta = elevation - (elevations[i - 1] ?? elevation);
      if (delta > 0) elevationGain += delta;
      grade = segmentDist > 0 ? (delta / segmentDist) * 100 : 0;
      segmentGrades.push(grade);
      if (Math.abs(grade) > Math.abs(maxGrade)) maxGrade = grade;
    }

    profile.push({ distance: cumulative, elevation, lng, lat, grade });
  }

  return { profile, elevationGain, maxGrade, segmentGrades };
}

export async function fetchWalkingRoute(
  token: string,
  fromLng: number,
  fromLat: number,
  toLng: number = DESTINATION.lng,
  toLat: number = DESTINATION.lat
): Promise<{
  coordinates: [number, number][];
  distanceMeters: number;
  durationSeconds: number;
}> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&access_token=${token}`;

  const res = await fetch(url);
  const data = (await res.json()) as DirectionsResponse;

  if (!res.ok || !data.routes?.[0]) {
    throw new Error(data.message || "Falha ao obter rota a pé");
  }

  const route = data.routes[0];
  return {
    coordinates: route.geometry.coordinates,
    distanceMeters: route.distance,
    durationSeconds: route.duration ?? route.distance / 1.333,
  };
}

/** Monta perfil de elevação a partir de uma geometria a pé (ex.: trechos Caminhe). */
export function legFromCoordinates(
  map: MapboxMap,
  coordinates: [number, number][],
  distanceMeters: number,
  durationSeconds: number
): WalkLegAnalysis {
  const empty: WalkLegAnalysis = {
    distanceMeters: 0,
    durationMinutes: 0,
    elevationGain: 0,
    maxGrade: 0,
    topography: "Plano",
    coordinates: [],
    elevationProfile: [],
    segmentGrades: [],
  };
  if (coordinates.length < 2 || distanceMeters < 50) {
    return empty;
  }
  const a = coordinates[0];
  const b = coordinates[coordinates.length - 1];
  if (a[0] === b[0] && a[1] === b[1]) {
    return empty;
  }
  const sampled = resampleRoute(coordinates);
  const elevations = extractElevations(map, sampled);
  const { profile, elevationGain, maxGrade, segmentGrades } = buildProfile(
    sampled,
    elevations
  );
  return {
    distanceMeters,
    durationMinutes: Math.max(1, Math.round(durationSeconds / 60)),
    elevationGain,
    maxGrade,
    topography: classifyTopography(elevationGain, maxGrade),
    coordinates,
    elevationProfile: profile,
    segmentGrades,
  };
}

/**
 * Análise a pé ida/volta porta-a-porta (Mapbox walking) — usada em cards/mapa.
 * O gráfico de Elevação no painel usa só trechos Caminhe do Google (transit).
 */
export async function analyzeRoute(
  map: MapboxMap,
  token: string,
  apartmentId: string,
  lng: number,
  lat: number
): Promise<RouteAnalysis> {
  const [outbound, inbound] = await Promise.all([
    fetchWalkingRoute(token, lng, lat, DESTINATION.lng, DESTINATION.lat),
    fetchWalkingRoute(token, DESTINATION.lng, DESTINATION.lat, lng, lat),
  ]);

  const ida = legFromCoordinates(
    map,
    outbound.coordinates,
    outbound.distanceMeters,
    outbound.durationSeconds
  );
  const volta = legFromCoordinates(
    map,
    inbound.coordinates,
    inbound.distanceMeters,
    inbound.durationSeconds
  );

  return {
    apartmentId,
    ida,
    volta,
    // flat = ida (mapa / cards / ordenação)
    distanceMeters: ida.distanceMeters,
    elevationGain: ida.elevationGain,
    maxGrade: ida.maxGrade,
    topography: ida.topography,
    coordinates: ida.coordinates,
    elevationProfile: ida.elevationProfile,
    segmentGrades: ida.segmentGrades,
  };
}

export function gradeBucket(grade: number): "green" | "yellow" | "red" {
  const abs = Math.abs(grade);
  if (abs < GRADE_THRESHOLDS.green) return "green";
  if (abs <= GRADE_THRESHOLDS.yellow) return "yellow";
  return "red";
}
