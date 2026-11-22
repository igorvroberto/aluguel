import * as turf from "@turf/turf";
import type { Map as MapboxMap } from "mapbox-gl";
import {
  DESTINATION,
  GRADE_THRESHOLDS,
  SAMPLE_INTERVAL_METERS,
  TOPOGRAPHY_THRESHOLDS,
} from "./constants";
import type { ElevationPoint, RouteAnalysis, TopographyClass } from "./types";

interface DirectionsResponse {
  routes?: Array<{
    distance: number;
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

  // Ladeira Íngreme: > 28m OR > 7%
  if (
    elevationGain > TOPOGRAPHY_THRESHOLDS.moderateGain ||
    absMax > TOPOGRAPHY_THRESHOLDS.moderateGrade
  ) {
    return "Ladeira Íngreme";
  }

  // Plano: <= 12m AND máx < 4%
  if (
    elevationGain <= TOPOGRAPHY_THRESHOLDS.flatGain &&
    absMax < TOPOGRAPHY_THRESHOLDS.flatGrade
  ) {
    return "Plano";
  }

  // Inclinação Moderada: 13–28m OR 4–7% (e demais casos intermediários)
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
): { profile: ElevationPoint[]; elevationGain: number; maxGrade: number; segmentGrades: number[] } {
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
  fromLat: number
): Promise<{ coordinates: [number, number][]; distanceMeters: number }> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${fromLng},${fromLat};${DESTINATION.lng},${DESTINATION.lat}` +
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
  };
}

export async function analyzeRoute(
  map: MapboxMap,
  token: string,
  apartmentId: string,
  lng: number,
  lat: number
): Promise<RouteAnalysis> {
  const { coordinates, distanceMeters } = await fetchWalkingRoute(token, lng, lat);
  const sampled = resampleRoute(coordinates);
  const elevations = extractElevations(map, sampled);
  const { profile, elevationGain, maxGrade, segmentGrades } = buildProfile(
    sampled,
    elevations
  );

  return {
    apartmentId,
    distanceMeters,
    elevationGain,
    maxGrade,
    topography: classifyTopography(elevationGain, maxGrade),
    coordinates,
    elevationProfile: profile,
    segmentGrades,
  };
}

export function gradeBucket(grade: number): "green" | "yellow" | "red" {
  const abs = Math.abs(grade);
  if (abs < GRADE_THRESHOLDS.green) return "green";
  if (abs <= GRADE_THRESHOLDS.yellow) return "yellow";
  return "red";
}
