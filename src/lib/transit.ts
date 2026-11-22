import { METRO_STATIONS } from "../../data/linhasMetro";
import { BUS_LINES } from "./bus-lines";
import { DESTINATION } from "./constants";
import { decodeGooglePolyline } from "./polyline";

export type TransitStepMode = "WALK" | "BUS" | "SUBWAY" | "TRANSIT";

export interface TransitStep {
  mode: TransitStepMode;
  instruction: string;
  durationMinutes: number;
  distanceMeters?: number;
  lineName?: string;
  /** Geometria só em passos WALK (Caminhe) — nunca metrô/ônibus. */
  coordinates?: [number, number][];
}

/** Um trecho contínuo a pé (Caminhe) — nunca inclui metrô/ônibus. */
export interface WalkPathSegment {
  label: string;
  coordinates: [number, number][];
  distanceMeters: number;
  durationMinutes: number;
}

export interface TransitRouteResult {
  source: "google" | "fallback" | "walk-preferred";
  totalDurationMinutes: number;
  walkDurationMinutes: number;
  steps: TransitStep[];
  summary: string;
  /** Se true, a pé direto é mais rápido que metrô/ônibus + caminhadas. */
  preferDirectWalk?: boolean;
  directWalkMinutes?: number;
  /**
   * Trechos WALK/Caminhe separados (para elevação sem interpolar o vão do metrô).
   */
  walkSegments: WalkPathSegment[];
  /** Flatten só para compat — preferir walkSegments no gráfico. */
  walkCoordinates: [number, number][];
  walkDistanceMeters: number;
}

export type TripDirection = "ida" | "volta";

/** Fator urbano: linha reta → caminhada real aproximada. */
const WALK_DETOUR = 1.35;
/** ~4.8 km/h a pé */
const WALK_METERS_PER_MIN = 80;
/** ~28 km/h metrô médio + paradas */
const METRO_METERS_PER_MIN = 470;
const METRO_WAIT_MINUTES = 4;

function haversineMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function walkMinutesFromMeters(meters: number): number {
  return Math.max(1, Math.round((meters * WALK_DETOUR) / WALK_METERS_PER_MIN));
}

function estimateDirectWalkMinutes(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  overrideMinutes?: number
): number {
  if (
    overrideMinutes != null &&
    Number.isFinite(overrideMinutes) &&
    overrideMinutes > 0
  ) {
    return Math.max(1, Math.round(overrideMinutes));
  }
  return walkMinutesFromMeters(
    haversineMeters(fromLat, fromLng, toLat, toLng)
  );
}

function formatWalkTo(place: string, minutes: number): string {
  return `Caminhe ${minutes} min até ${place}`;
}

function extractWalkPaths(steps: TransitStep[]): {
  walkSegments: WalkPathSegment[];
  walkCoordinates: [number, number][];
  walkDistanceMeters: number;
} {
  const walkSegments: WalkPathSegment[] = [];
  const walkCoordinates: [number, number][] = [];
  let walkDistanceMeters = 0;

  for (const step of steps) {
    if (step.mode !== "WALK") continue;
    const coords = step.coordinates;
    if (!coords || coords.length < 2) continue;
    const distanceMeters =
      step.distanceMeters ??
      Math.round(
        haversineMeters(coords[0][1], coords[0][0], coords[coords.length - 1][1], coords[coords.length - 1][0]) *
          WALK_DETOUR
      );
    walkDistanceMeters += distanceMeters;
    walkSegments.push({
      label: step.instruction,
      coordinates: coords,
      distanceMeters,
      durationMinutes: step.durationMinutes,
    });
    for (const c of coords) {
      const prev = walkCoordinates[walkCoordinates.length - 1];
      if (prev && prev[0] === c[0] && prev[1] === c[1]) continue;
      walkCoordinates.push(c);
    }
  }

  return { walkSegments, walkCoordinates, walkDistanceMeters };
}

type Hub = {
  kind: "station" | "bus";
  name: string;
  lat: number;
  lng: number;
  lineLabel: string;
};

function allHubs(): Hub[] {
  const metro: Hub[] = METRO_STATIONS.map((s) => ({
    kind: "station" as const,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    lineLabel: `${s.lineCode} ${s.name}`,
  }));

  const buses: Hub[] = BUS_LINES.flatMap((line) => {
    const pts = [
      line.coordinates[0],
      line.coordinates[Math.floor(line.coordinates.length / 2)],
      line.coordinates[line.coordinates.length - 1],
    ];
    return pts.map((c, i) => ({
      kind: "bus" as const,
      name: `Ponto ${line.code}${i === 1 ? " (meio)" : ""}`,
      lat: c[1],
      lng: c[0],
      lineLabel: `${line.code} (${line.name})`,
    }));
  });

  return [...metro, ...buses];
}

function nearestHub(
  lat: number,
  lng: number,
  hubs: Hub[]
): { hub: Hub; distanceM: number } {
  let best = hubs[0];
  let bestD = Number.POSITIVE_INFINITY;
  for (const h of hubs) {
    const d = haversineMeters(lat, lng, h.lat, h.lng);
    if (d < bestD) {
      bestD = d;
      best = h;
    }
  }
  return { hub: best, distanceM: bestD };
}

function rideMinutesBetween(a: Hub, b: Hub): number {
  if (a.name === b.name && a.lat === b.lat && a.lng === b.lng) {
    return 0;
  }
  const dist = haversineMeters(a.lat, a.lng, b.lat, b.lng);
  const moving = Math.max(2, Math.round(dist / METRO_METERS_PER_MIN));
  return moving + METRO_WAIT_MINUTES;
}

/** Mapbox walking só para um trecho Caminhe (origem→hub ou hub→destino). */
async function fetchMapboxWalkCoords(
  token: string,
  fromLng: number,
  fromLat: number,
  toLng: number,
  toLat: number
): Promise<{ coordinates: [number, number][]; distanceMeters: number }> {
  const url =
    `https://api.mapbox.com/directions/v5/mapbox/walking/` +
    `${fromLng},${fromLat};${toLng},${toLat}` +
    `?geometries=geojson&overview=full&access_token=${token}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(12000) });
  const data = (await res.json()) as {
    routes?: Array<{
      distance: number;
      geometry: { coordinates: [number, number][] };
    }>;
  };
  if (!res.ok || !data.routes?.[0]) {
    return {
      coordinates: [
        [fromLng, fromLat],
        [toLng, toLat],
      ],
      distanceMeters: haversineMeters(fromLat, fromLng, toLat, toLng) * WALK_DETOUR,
    };
  }
  return {
    coordinates: data.routes[0].geometry.coordinates,
    distanceMeters: data.routes[0].distance,
  };
}

/**
 * Heurística multimodal. Elevação usa só caminhadas origem↔hub e hub↔destino
 * (nunca o metrô/ônibus nem o a pé porta-a-porta completo).
 */
export async function buildFallbackTransitRoute(
  originLat: number,
  originLng: number,
  direction: TripDirection = "ida",
  directWalkMinutesOverride?: number,
  mapboxToken?: string
): Promise<TransitRouteResult> {
  const fromLat = direction === "ida" ? originLat : DESTINATION.lat;
  const fromLng = direction === "ida" ? originLng : DESTINATION.lng;
  const toLat = direction === "ida" ? DESTINATION.lat : originLat;
  const toLng = direction === "ida" ? DESTINATION.lng : originLng;
  const toLabel = direction === "ida" ? DESTINATION.name : "o imóvel";

  const directWalkMin = estimateDirectWalkMinutes(
    fromLat,
    fromLng,
    toLat,
    toLng,
    directWalkMinutesOverride
  );

  const hubs = allHubs();
  const originHub = nearestHub(fromLat, fromLng, hubs);
  const destHub = nearestHub(toLat, toLng, hubs);

  let walkToCoords: [number, number][];
  let walkFromCoords: [number, number][];
  let walkToDist: number;
  let walkFromDist: number;

  if (mapboxToken) {
    const [toHub, fromHub] = await Promise.all([
      fetchMapboxWalkCoords(
        mapboxToken,
        fromLng,
        fromLat,
        originHub.hub.lng,
        originHub.hub.lat
      ),
      fetchMapboxWalkCoords(
        mapboxToken,
        destHub.hub.lng,
        destHub.hub.lat,
        toLng,
        toLat
      ),
    ]);
    walkToCoords = toHub.coordinates;
    walkFromCoords = fromHub.coordinates;
    walkToDist = toHub.distanceMeters;
    walkFromDist = fromHub.distanceMeters;
  } else {
    walkToCoords = [
      [fromLng, fromLat],
      [originHub.hub.lng, originHub.hub.lat],
    ];
    walkFromCoords = [
      [destHub.hub.lng, destHub.hub.lat],
      [toLng, toLat],
    ];
    walkToDist = originHub.distanceM;
    walkFromDist = destHub.distanceM;
  }

  const walkToHubMin = walkMinutesFromMeters(walkToDist);
  const walkFromHubMin = walkMinutesFromMeters(walkFromDist);
  const rideMin = rideMinutesBetween(originHub.hub, destHub.hub);
  const transitTotal = walkToHubMin + rideMin + walkFromHubMin;

  const walkSteps: TransitStep[] = [
    {
      mode: "WALK",
      instruction: formatWalkTo(originHub.hub.name, walkToHubMin),
      durationMinutes: walkToHubMin,
      distanceMeters: Math.round(walkToDist),
      coordinates: walkToCoords,
    },
  ];
  if (rideMin > 0) {
    const mode: TransitStepMode =
      originHub.hub.kind === "station" || destHub.hub.kind === "station"
        ? "SUBWAY"
        : "BUS";
    const rideVerb = mode === "SUBWAY" ? "Metrô/ônibus" : "Ônibus";
    walkSteps.push({
      mode,
      instruction: `${rideVerb} ${originHub.hub.lineLabel} → ${destHub.hub.name} (${rideMin} min)`,
      durationMinutes: rideMin,
      lineName: originHub.hub.lineLabel,
    });
  }
  walkSteps.push({
    mode: "WALK",
    instruction: formatWalkTo(toLabel, walkFromHubMin),
    durationMinutes: walkFromHubMin,
    distanceMeters: Math.round(walkFromDist),
    coordinates: walkFromCoords,
  });

  const { walkSegments, walkCoordinates, walkDistanceMeters } =
    extractWalkPaths(walkSteps);

  if (directWalkMin + 2 < transitTotal) {
    return {
      source: "walk-preferred",
      totalDurationMinutes: directWalkMin,
      walkDurationMinutes: directWalkMin,
      steps: [
        {
          mode: "WALK",
          instruction: `Vá a pé direto até ${toLabel} (${directWalkMin} min) — mais rápido que metrô/ônibus neste caso`,
          durationMinutes: directWalkMin,
        },
      ],
      summary: `A pé direto (${directWalkMin} min) é melhor que TRANSIT (${transitTotal} min)`,
      preferDirectWalk: true,
      directWalkMinutes: directWalkMin,
      // Elevação só nos trechos Caminhe do multimodal (walkSegments), não no a pé total
      walkSegments,
      walkCoordinates,
      walkDistanceMeters,
    };
  }

  const walkDurationMinutes = walkToHubMin + walkFromHubMin;

  return {
    source: "fallback",
    totalDurationMinutes: transitTotal,
    walkDurationMinutes,
    steps: walkSteps,
    summary: walkSteps.map((s) => s.instruction).join(" → "),
    preferDirectWalk: false,
    directWalkMinutes: directWalkMin,
    walkSegments,
    walkCoordinates,
    walkDistanceMeters,
  };
}

interface GoogleRoutesResponse {
  routes?: Array<{
    duration?: string;
    legs?: Array<{
      steps?: Array<{
        staticDuration?: string;
        distanceMeters?: number;
        navigationInstruction?: { instructions?: string };
        travelMode?: string;
        polyline?: { encodedPolyline?: string };
        transitDetails?: {
          transitLine?: {
            nameShort?: string;
            name?: string;
            vehicle?: { type?: string; name?: { text?: string } };
          };
          stopDetails?: {
            arrivalStop?: { name?: string };
            departureStop?: { name?: string };
          };
        };
      }>;
    }>;
  }>;
  error?: { message?: string; status?: string };
}

function parseDurationSeconds(duration?: string): number {
  if (!duration) return 0;
  const m = duration.match(/^(\d+)s$/);
  return m ? Number(m[1]) : 0;
}

function googleModeToOurs(mode?: string, vehicleType?: string): TransitStepMode {
  const m = (mode || "").toUpperCase();
  const v = (vehicleType || "").toUpperCase();
  if (m === "WALK" || m === "WALKING") return "WALK";
  if (v.includes("BUS") || m.includes("BUS")) return "BUS";
  if (v.includes("SUBWAY") || v.includes("METRO") || m.includes("TRANSIT")) {
    if (v.includes("BUS")) return "BUS";
    return "SUBWAY";
  }
  if (m === "TRANSIT") return "TRANSIT";
  return "WALK";
}

export async function fetchGoogleTransitRoute(
  apiKey: string,
  originLat: number,
  originLng: number,
  direction: TripDirection = "ida",
  directWalkMinutesOverride?: number
): Promise<TransitRouteResult> {
  const from =
    direction === "ida"
      ? { lat: originLat, lng: originLng }
      : { lat: DESTINATION.lat, lng: DESTINATION.lng };
  const to =
    direction === "ida"
      ? { lat: DESTINATION.lat, lng: DESTINATION.lng }
      : { lat: originLat, lng: originLng };

  const directWalkMin = estimateDirectWalkMinutes(
    from.lat,
    from.lng,
    to.lat,
    to.lng,
    directWalkMinutesOverride
  );

  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.transitDetails,routes.legs.steps.polyline",
      },
      body: JSON.stringify({
        origin: {
          location: {
            latLng: { latitude: from.lat, longitude: from.lng },
          },
        },
        destination: {
          location: {
            latLng: { latitude: to.lat, longitude: to.lng },
          },
        },
        travelMode: "TRANSIT",
        languageCode: "pt-BR",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(15000),
    }
  );

  const data = (await res.json()) as GoogleRoutesResponse;
  if (!res.ok || !data.routes?.[0]?.legs?.[0]?.steps?.length) {
    throw new Error(
      data.error?.message || "Google Routes não retornou trajeto TRANSIT"
    );
  }

  const stepsRaw = data.routes[0].legs[0].steps!;
  const steps: TransitStep[] = stepsRaw.map((s) => {
    const seconds = parseDurationSeconds(s.staticDuration);
    const minutes = Math.max(1, Math.round(seconds / 60));
    const line =
      s.transitDetails?.transitLine?.nameShort ||
      s.transitDetails?.transitLine?.name;
    const vehicleType = s.transitDetails?.transitLine?.vehicle?.type;
    const mode = googleModeToOurs(s.travelMode, vehicleType);
    const nav = s.navigationInstruction?.instructions;
    const dep = s.transitDetails?.stopDetails?.departureStop?.name;
    const arr = s.transitDetails?.stopDetails?.arrivalStop?.name;

    let instruction = nav || "";
    if (mode === "WALK") {
      instruction =
        nav ||
        `Caminhe ${minutes} min${arr ? ` até ${arr}` : dep ? ` até ${dep}` : ""}`;
    } else if (line) {
      const label =
        mode === "BUS" ? "Ônibus" : mode === "SUBWAY" ? "Metrô" : "Transporte";
      instruction =
        `${label} ${line} (${minutes} min)` + (arr ? ` → ${arr}` : "");
    } else if (!instruction) {
      instruction = `Trecho ${mode.toLowerCase()} (${minutes} min)`;
    }

    const encoded = s.polyline?.encodedPolyline;
    // Geometria só para WALK — metrô/ônibus ficam de fora da elevação
    const coordinates =
      mode === "WALK" && encoded
        ? decodeGooglePolyline(encoded)
        : undefined;

    return {
      mode,
      instruction: instruction.trim(),
      durationMinutes: minutes,
      distanceMeters: s.distanceMeters,
      lineName: line,
      coordinates,
    };
  });

  const { walkSegments, walkCoordinates, walkDistanceMeters } =
    extractWalkPaths(steps);

  const totalSeconds = parseDurationSeconds(data.routes[0].duration);
  const totalDurationMinutes =
    totalSeconds > 0
      ? Math.max(1, Math.round(totalSeconds / 60))
      : steps.reduce((sum, s) => sum + s.durationMinutes, 0);

  const walkDurationMinutes = steps
    .filter((s) => s.mode === "WALK")
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  if (directWalkMin + 2 < totalDurationMinutes) {
    const toLabel = direction === "ida" ? DESTINATION.name : "o imóvel";
    return {
      source: "walk-preferred",
      totalDurationMinutes: directWalkMin,
      walkDurationMinutes: directWalkMin,
      steps: [
        {
          mode: "WALK",
          instruction: `Vá a pé direto até ${toLabel} (${directWalkMin} min) — mais rápido que o transporte público neste caso`,
          durationMinutes: directWalkMin,
        },
      ],
      summary: `A pé direto (${directWalkMin} min) é melhor que TRANSIT (${totalDurationMinutes} min)`,
      preferDirectWalk: true,
      directWalkMinutes: directWalkMin,
      walkSegments,
      walkCoordinates,
      walkDistanceMeters,
    };
  }

  return {
    source: "google",
    totalDurationMinutes,
    walkDurationMinutes,
    steps,
    summary: steps.map((s) => s.instruction).join(" → "),
    preferDirectWalk: false,
    directWalkMinutes: directWalkMin,
    walkSegments,
    walkCoordinates,
    walkDistanceMeters,
  };
}
