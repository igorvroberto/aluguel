import * as turf from "@turf/turf";

/** Amostragem ao longo do trecho a pé (metros). */
export const ELEVATION_SAMPLE_INTERVAL_M = 25;
/** Máx. amostras por request (Elevation API path). */
const MAX_SAMPLES = 100;
/** Desnível líquido mínimo para chamar de subida/descida. */
const NET_DIRECTION_THRESHOLD_M = 4;

export type SlopeDirection = "subida" | "descida" | "misto" | "plano";

export type SteepnessClass =
  | "Plano"
  | "Suave"
  | "Moderada"
  | "Íngreme"
  | "Muito íngreme";

export interface WalkElevationStats {
  direction: SlopeDirection;
  /** Ex.: "Subida", "Descida", "Sobe e desce", "Plano" */
  directionLabel: string;
  steepness: SteepnessClass;
  /** Inclinação típica (máx. |grade| no trecho), em %. */
  maxGradePercent: number;
  /** Desnível líquido (fim − início), metros. Positivo = sobe. */
  netGainMeters: number;
  elevationGainMeters: number;
  elevationLossMeters: number;
  startElevationMeters: number;
  endElevationMeters: number;
  sampleCount: number;
}

interface ElevationApiResult {
  results?: Array<{
    elevation: number;
    location: { lat: number; lng: number };
  }>;
  status?: string;
  error_message?: string;
}

function classifySteepness(absMaxGradePercent: number): SteepnessClass {
  if (absMaxGradePercent < 3) return "Plano";
  if (absMaxGradePercent < 5) return "Suave";
  if (absMaxGradePercent < 8) return "Moderada";
  if (absMaxGradePercent < 12) return "Íngreme";
  return "Muito íngreme";
}

function classifyDirection(
  netGainMeters: number,
  elevationGainMeters: number,
  elevationLossMeters: number
): { direction: SlopeDirection; directionLabel: string } {
  const bothWays =
    elevationGainMeters >= NET_DIRECTION_THRESHOLD_M &&
    elevationLossMeters >= NET_DIRECTION_THRESHOLD_M;

  if (bothWays && Math.abs(netGainMeters) < NET_DIRECTION_THRESHOLD_M * 1.5) {
    return { direction: "misto", directionLabel: "Sobe e desce" };
  }
  if (netGainMeters >= NET_DIRECTION_THRESHOLD_M) {
    return { direction: "subida", directionLabel: "Subida" };
  }
  if (netGainMeters <= -NET_DIRECTION_THRESHOLD_M) {
    return { direction: "descida", directionLabel: "Descida" };
  }
  if (bothWays) {
    return { direction: "misto", directionLabel: "Sobe e desce" };
  }
  return { direction: "plano", directionLabel: "Plano" };
}

/** Resampleia a polyline [lng,lat] a cada ~interval metros. */
export function resamplePath(
  coordinates: [number, number][],
  intervalMeters = ELEVATION_SAMPLE_INTERVAL_M
): [number, number][] {
  if (coordinates.length < 2) return coordinates;
  const line = turf.lineString(coordinates);
  const length = turf.length(line, { units: "meters" });
  if (length <= 0) return [coordinates[0], coordinates[coordinates.length - 1]];

  const samples = Math.min(
    MAX_SAMPLES,
    Math.max(2, Math.ceil(length / intervalMeters) + 1)
  );
  const step = length / (samples - 1);
  const points: [number, number][] = [];
  for (let i = 0; i < samples; i++) {
    const d = Math.min(length, i * step);
    const pt = turf.along(line, d, { units: "meters" });
    const [lng, lat] = pt.geometry.coordinates;
    points.push([lng, lat]);
  }
  return points;
}

/** Reduz vértices do path para caber na URL da Elevation API. */
function thinPath(
  coordinates: [number, number][],
  maxPoints = 40
): [number, number][] {
  if (coordinates.length <= maxPoints) return coordinates;
  const out: [number, number][] = [];
  const last = coordinates.length - 1;
  for (let i = 0; i < maxPoints; i++) {
    const idx = Math.round((i * last) / (maxPoints - 1));
    out.push(coordinates[idx]);
  }
  return out;
}

/**
 * Elevação ao longo do path via Google Elevation API (`path` + `samples`).
 * coordinates: [lng, lat][].
 */
export async function fetchPathElevations(
  apiKey: string,
  coordinates: [number, number][]
): Promise<{ points: [number, number][]; elevations: number[] }> {
  if (coordinates.length < 2) return { points: [], elevations: [] };

  const line = turf.lineString(coordinates);
  const length = turf.length(line, { units: "meters" });
  const samples = Math.min(
    MAX_SAMPLES,
    Math.max(2, Math.ceil(length / ELEVATION_SAMPLE_INTERVAL_M) + 1)
  );

  const pathVerts = thinPath(coordinates, 40);
  const path = pathVerts
    .map(([lng, lat]) => `${lat.toFixed(5)},${lng.toFixed(5)}`)
    .join("|");
  const url =
    `https://maps.googleapis.com/maps/api/elevation/json` +
    `?path=${encodeURIComponent(path)}` +
    `&samples=${samples}` +
    `&key=${apiKey}`;

  const res = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const data = (await res.json()) as ElevationApiResult;
  if (!res.ok || data.status !== "OK" || !data.results?.length) {
    throw new Error(
      data.error_message ||
        data.status ||
        "Elevation API não retornou altitudes"
    );
  }

  // Resultados já são amostras uniformes ao longo do path.
  const points: [number, number][] = data.results.map((r) => [
    r.location.lng,
    r.location.lat,
  ]);
  return {
    points,
    elevations: data.results.map((r) => r.elevation),
  };
}

export function analyzeElevations(
  sampledCoords: [number, number][],
  elevations: number[]
): WalkElevationStats | null {
  if (sampledCoords.length < 2 || elevations.length < 2) return null;
  const n = Math.min(sampledCoords.length, elevations.length);

  let elevationGainMeters = 0;
  let elevationLossMeters = 0;
  let maxAbsGrade = 0;
  let maxSignedGrade = 0;

  for (let i = 1; i < n; i++) {
    const dist = turf.distance(
      turf.point(sampledCoords[i - 1]),
      turf.point(sampledCoords[i]),
      { units: "meters" }
    );
    const delta = elevations[i] - elevations[i - 1];
    if (delta > 0) elevationGainMeters += delta;
    else elevationLossMeters += -delta;
    if (dist > 0.5) {
      const grade = (delta / dist) * 100;
      if (Math.abs(grade) > maxAbsGrade) {
        maxAbsGrade = Math.abs(grade);
        maxSignedGrade = grade;
      }
    }
  }

  const startElevationMeters = elevations[0];
  const endElevationMeters = elevations[n - 1];
  const netGainMeters = endElevationMeters - startElevationMeters;
  const { direction, directionLabel } = classifyDirection(
    netGainMeters,
    elevationGainMeters,
    elevationLossMeters
  );
  const steepness = classifySteepness(maxAbsGrade);

  return {
    direction,
    directionLabel,
    steepness,
    maxGradePercent: Math.round(maxSignedGrade * 10) / 10,
    netGainMeters: Math.round(netGainMeters * 10) / 10,
    elevationGainMeters: Math.round(elevationGainMeters * 10) / 10,
    elevationLossMeters: Math.round(elevationLossMeters * 10) / 10,
    startElevationMeters: Math.round(startElevationMeters * 10) / 10,
    endElevationMeters: Math.round(endElevationMeters * 10) / 10,
    sampleCount: n,
  };
}

/** Analisa um trecho a pé [lng,lat][]. */
export async function analyzeWalkElevation(
  apiKey: string,
  coordinates: [number, number][]
): Promise<WalkElevationStats | null> {
  if (!coordinates || coordinates.length < 2) return null;
  const { points, elevations } = await fetchPathElevations(apiKey, coordinates);
  return analyzeElevations(points, elevations);
}

/** Texto curto para UI: "Subida · Moderada · máx. 7,2% · +18 m". */
export function formatWalkElevationSummary(stats: WalkElevationStats): string {
  const gradeAbs = Math.abs(stats.maxGradePercent)
    .toFixed(1)
    .replace(".", ",");
  const net =
    stats.netGainMeters >= 0
      ? `+${Math.round(stats.netGainMeters)} m`
      : `${Math.round(stats.netGainMeters)} m`;
  return `${stats.directionLabel} · ${stats.steepness} · máx. ${gradeAbs}% · ${net}`;
}
