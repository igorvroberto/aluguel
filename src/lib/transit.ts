import { BUS_STOPS } from "../../data/busStops";
import { METRO_STATIONS } from "../../data/linhasMetro";
import { DESTINATION } from "./constants";
import {
  fetchNearbyTransitPlaces,
  type PlaceTransitHub,
} from "./googlePlaces";
import {
  analyzeWalkElevation,
  type WalkElevationStats,
} from "./elevation";
import { decodeGooglePolyline } from "./polyline";

export type TransitStepMode = "WALK" | "BUS" | "SUBWAY" | "TRANSIT";

export interface TransitStep {
  mode: TransitStepMode;
  instruction: string;
  durationMinutes: number;
  distanceMeters?: number;
  lineName?: string;
  /** Geometria do passo (Google polyline) — WALK + BUS/SUBWAY no mapa. */
  coordinates?: [number, number][];
  /** Só WALK: subida/descida e íngreme (Elevation API). */
  elevation?: WalkElevationStats;
}

/** Cor do traçado no mapa (estilo multimodal). */
export function transitModeMapColor(mode: TransitStepMode): string {
  switch (mode) {
    case "WALK":
      return "#0f766e";
    case "BUS":
      return "#2563eb";
    // Roxo — distinto da Linha 3-Vermelha (#EE352E) e da L6-Laranja
    case "SUBWAY":
      return "#7c3aed";
    default:
      return "#64748b";
  }
}

/** Itens da legenda do mapa (trajeto). */
export const TRANSIT_ROUTE_LEGEND: ReadonlyArray<{
  mode: TransitStepMode;
  label: string;
  color: string;
}> = [
  { mode: "WALK", label: "A pé", color: transitModeMapColor("WALK") },
  { mode: "BUS", label: "Ônibus", color: transitModeMapColor("BUS") },
  {
    mode: "SUBWAY",
    label: "Metrô (trajeto)",
    color: transitModeMapColor("SUBWAY"),
  },
];

/** Um trecho contínuo a pé (Caminhe) — nunca inclui metrô/ônibus. */
export interface WalkPathSegment {
  label: string;
  coordinates: [number, number][];
  distanceMeters: number;
  durationMinutes: number;
  elevation?: WalkElevationStats;
}

export interface TransitRouteResult {
  source: "google" | "fallback";
  totalDurationMinutes: number;
  /** Soma das distâncias dos passos (porta a porta). */
  totalDistanceMeters: number;
  walkDurationMinutes: number;
  steps: TransitStep[];
  summary: string;
  /** Rótulo curto estilo Maps: "Ônibus 175P-10 · 22 min" */
  optionLabel?: string;
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

function formatWalkTo(place: string, minutes: number): string {
  return `Caminhe ${minutes} min até ${place}`;
}

/**
 * Um segmento por passo WALK (Caminhe) do Google — elevação por trecho,
 * sem interpolar o vão do metrô/ônibus.
 */
function extractWalkPaths(steps: TransitStep[]): {
  walkSegments: WalkPathSegment[];
  walkCoordinates: [number, number][];
  walkDistanceMeters: number;
} {
  const walkSegments: WalkPathSegment[] = [];
  const walkCoordinates: [number, number][] = [];
  let walkDistanceMeters = 0;
  let walkIndex = 0;

  for (const step of steps) {
    if (step.mode !== "WALK") continue;
    const coords = step.coordinates;
    if (!coords || coords.length < 2) continue;
    walkIndex += 1;
    const distanceMeters =
      step.distanceMeters ??
      Math.round(
        haversineMeters(
          coords[0][1],
          coords[0][0],
          coords[coords.length - 1][1],
          coords[coords.length - 1][0]
        ) * WALK_DETOUR
      );
    walkDistanceMeters += distanceMeters;
    walkSegments.push({
      label:
        step.instruction ||
        `Trecho a pé ${walkIndex} (${step.durationMinutes} min)`,
      coordinates: coords,
      distanceMeters,
      durationMinutes: step.durationMinutes,
      elevation: step.elevation,
    });
    for (const c of coords) {
      const prev = walkCoordinates[walkCoordinates.length - 1];
      if (prev && prev[0] === c[0] && prev[1] === c[1]) continue;
      walkCoordinates.push(c);
    }
  }

  return { walkSegments, walkCoordinates, walkDistanceMeters };
}

/** Anexa Elevation API a cada passo WALK (e espelha em walkSegments). */
export async function enrichRouteWithWalkElevation(
  apiKey: string,
  route: TransitRouteResult
): Promise<TransitRouteResult> {
  const steps = await Promise.all(
    route.steps.map(async (step) => {
      if (
        step.mode !== "WALK" ||
        !step.coordinates ||
        step.coordinates.length < 2
      ) {
        return step;
      }
      try {
        const elevation = await analyzeWalkElevation(apiKey, step.coordinates);
        return elevation ? { ...step, elevation } : step;
      } catch (err) {
        console.warn("Elevation API falhou num trecho a pé:", err);
        return step;
      }
    })
  );
  const { walkSegments, walkCoordinates, walkDistanceMeters } =
    extractWalkPaths(steps);
  return {
    ...route,
    steps,
    walkSegments,
    walkCoordinates,
    walkDistanceMeters,
  };
}

export async function enrichRoutesWithWalkElevation(
  apiKey: string,
  routes: TransitRouteResult[]
): Promise<TransitRouteResult[]> {
  return Promise.all(
    routes.map((r) => enrichRouteWithWalkElevation(apiKey, r))
  );
}

type Hub = {
  kind: "station" | "bus";
  name: string;
  lat: number;
  lng: number;
  lineLabel: string;
  /** Códigos SPTrans / labels para preferir mesma linha na ida/volta */
  lineCodes: string[];
};

function staticHubs(): Hub[] {
  const metro: Hub[] = METRO_STATIONS.map((s) => ({
    kind: "station" as const,
    name: s.name,
    lat: s.lat,
    lng: s.lng,
    lineLabel: `${s.lineCode} ${s.name}`,
    lineCodes: [s.lineCode],
  }));

  // Paradas reais (Google/Moovit), NÃO vértices do traçado aproximado
  const buses: Hub[] = BUS_STOPS.map((stop) => ({
    kind: "bus" as const,
    name: stop.name,
    lat: stop.lat,
    lng: stop.lng,
    lineLabel: stop.lines.join(" / "),
    lineCodes: stop.lines,
  }));

  return [...metro, ...buses];
}

function placeToHub(place: PlaceTransitHub): Hub {
  const types = place.kinds.map((t) => t.toLowerCase());
  const isStation =
    types.some((t) => t.includes("subway") || t.includes("light_rail")) ||
    /metr[oô]|estação/i.test(place.name);
  return {
    kind: isStation ? "station" : "bus",
    name: place.name,
    lat: place.lat,
    lng: place.lng,
    lineLabel: place.name,
    lineCodes: [],
  };
}

function mergeHubs(base: Hub[], extra: Hub[]): Hub[] {
  const out = [...base];
  for (const h of extra) {
    const dup = out.some(
      (x) =>
        Math.abs(x.lat - h.lat) < 1e-4 && Math.abs(x.lng - h.lng) < 1e-4
    );
    if (!dup) out.push(h);
  }
  return out;
}

async function resolveHubs(googleApiKey?: string, samples?: Array<{ lat: number; lng: number }>): Promise<Hub[]> {
  let hubs = staticHubs();
  if (!googleApiKey || !samples?.length) return hubs;

  try {
    const batches = await Promise.all(
      samples.map((p) =>
        fetchNearbyTransitPlaces(googleApiKey, p.lat, p.lng, 1000).catch(
          () => [] as PlaceTransitHub[]
        )
      )
    );
    const fromPlaces = batches.flat().map(placeToHub);
    hubs = mergeHubs(hubs, fromPlaces);
  } catch (err) {
    console.warn("Não foi possível enriquecer hubs via Places:", err);
  }
  return hubs;
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

function sharesLine(a: Hub, b: Hub): boolean {
  if (!a.lineCodes.length || !b.lineCodes.length) return false;
  return a.lineCodes.some((c) => b.lineCodes.includes(c));
}

/**
 * Origem: hub mais perto. Destino: prefere parada da mesma linha
 * (trajeto Google-like), senão o hub mais perto do destino.
 */
function pickAccessHubs(
  fromLat: number,
  fromLng: number,
  toLat: number,
  toLng: number,
  hubs: Hub[]
): {
  originHub: { hub: Hub; distanceM: number };
  destHub: { hub: Hub; distanceM: number };
} {
  const originHub = nearestHub(fromLat, fromLng, hubs);
  const sameLine = hubs.filter(
    (h) =>
      sharesLine(h, originHub.hub) &&
      (h.lat !== originHub.hub.lat || h.lng !== originHub.hub.lng)
  );
  const destPool = sameLine.length > 0 ? sameLine : hubs;
  let destHub = nearestHub(toLat, toLng, destPool);

  // Evita “embarque = desembarque” (antes: FACULDADE como meio do traçado)
  if (
    destHub.hub.lat === originHub.hub.lat &&
    destHub.hub.lng === originHub.hub.lng
  ) {
    const others = hubs.filter(
      (h) => h.lat !== originHub.hub.lat || h.lng !== originHub.hub.lng
    );
    if (others.length) destHub = nearestHub(toLat, toLng, others);
  }

  return { originHub, destHub };
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
  mapboxToken?: string,
  googleApiKey?: string
): Promise<TransitRouteResult> {
  const fromLat = direction === "ida" ? originLat : DESTINATION.lat;
  const fromLng = direction === "ida" ? originLng : DESTINATION.lng;
  const toLat = direction === "ida" ? DESTINATION.lat : originLat;
  const toLng = direction === "ida" ? DESTINATION.lng : originLng;
  const toLabel = direction === "ida" ? DESTINATION.name : "o imóvel";

  const hubs = await resolveHubs(googleApiKey, [
    { lat: fromLat, lng: fromLng },
    { lat: toLat, lng: toLng },
  ]);
  const { originHub, destHub } = pickAccessHubs(
    fromLat,
    fromLng,
    toLat,
    toLng,
    hubs
  );

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

  const walkDurationMinutes = walkToHubMin + walkFromHubMin;

  return {
    source: "fallback",
    totalDurationMinutes: transitTotal,
    totalDistanceMeters: totalDistanceFromSteps(walkSteps),
    walkDurationMinutes,
    steps: walkSteps,
    summary: walkSteps.map((s) => s.instruction).join(" → "),
    walkSegments,
    walkCoordinates,
    walkDistanceMeters,
  };
}

interface GoogleRouteRaw {
  duration?: string;
  description?: string;
  routeLabels?: string[];
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
}

interface GoogleRoutesResponse {
  routes?: GoogleRouteRaw[];
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

function totalDistanceFromSteps(steps: TransitStep[]): number {
  return Math.round(
    steps.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0)
  );
}

function buildOptionLabel(
  steps: TransitStep[],
  totalDurationMinutes: number
): string {
  const transitBits = steps
    .filter((s) => s.mode !== "WALK")
    .map((s) => {
      const kind =
        s.mode === "BUS" ? "Ônibus" : s.mode === "SUBWAY" ? "Metrô" : "Transporte";
      return s.lineName ? `${kind} ${s.lineName}` : kind;
    });
  // Mantém a ordem dos trechos (não Set) — ônibus A→B ≠ B→A
  const modes = transitBits.length ? transitBits.join(" → ") : "A pé";
  const walkMin = steps
    .filter((s) => s.mode === "WALK")
    .reduce((sum, s) => sum + s.durationMinutes, 0);
  const walkBit = walkMin > 0 ? ` · ${walkMin} min a pé` : "";
  return `${modes} · ${totalDurationMinutes} min${walkBit}`;
}

/** Assinatura para deduplicar alternativas quase iguais do Google. */
function routeFingerprint(route: TransitRouteResult): string {
  const transitKey = route.steps
    .filter((s) => s.mode !== "WALK")
    .map((s) => `${s.mode}:${s.lineName || ""}`)
    .join("|");
  return [
    transitKey,
    route.totalDurationMinutes,
    route.walkDurationMinutes,
    Math.round(route.walkDistanceMeters / 50) * 50,
  ].join("::");
}

/** Mantém a ordem do Google e remove opções duplicadas. */
export function uniqueTransitRoutes(
  routes: TransitRouteResult[]
): TransitRouteResult[] {
  const seen = new Set<string>();
  const out: TransitRouteResult[] = [];
  for (const route of routes) {
    const key = routeFingerprint(route);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(route);
  }
  return out;
}

function parseGoogleRouteRaw(raw: GoogleRouteRaw): TransitRouteResult | null {
  const stepsRaw = raw.legs?.[0]?.steps;
  if (!stepsRaw?.length) return null;

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
    const coordinates = encoded ? decodeGooglePolyline(encoded) : undefined;

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

  const totalSeconds = parseDurationSeconds(raw.duration);
  const totalDurationMinutes =
    totalSeconds > 0
      ? Math.max(1, Math.round(totalSeconds / 60))
      : steps.reduce((sum, s) => sum + s.durationMinutes, 0);

  const walkDurationMinutes = steps
    .filter((s) => s.mode === "WALK")
    .reduce((sum, s) => sum + s.durationMinutes, 0);

  const summary = steps.map((s) => s.instruction).join(" → ");
  // Label pelos trechos reais — `description` do Google costuma repetir entre opções.
  const optionLabel = buildOptionLabel(steps, totalDurationMinutes);

  return {
    source: "google",
    totalDurationMinutes,
    totalDistanceMeters: totalDistanceFromSteps(steps),
    walkDurationMinutes,
    steps,
    summary,
    optionLabel,
    walkSegments,
    walkCoordinates,
    walkDistanceMeters,
  };
}

/**
 * Opções de transporte exatamente como o Google Maps (Routes API TRANSIT),
 * com alternativas (ônibus vs metrô etc.) quando disponíveis.
 */
export async function fetchGoogleTransitRoutes(
  apiKey: string,
  originLat: number,
  originLng: number,
  direction: TripDirection = "ida"
): Promise<TransitRouteResult[]> {
  const from =
    direction === "ida"
      ? { lat: originLat, lng: originLng }
      : { lat: DESTINATION.lat, lng: DESTINATION.lng };
  const to =
    direction === "ida"
      ? { lat: DESTINATION.lat, lng: DESTINATION.lng }
      : { lat: originLat, lng: originLng };

  const res = await fetch(
    "https://routes.googleapis.com/directions/v2:computeRoutes",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": apiKey,
        "X-Goog-FieldMask":
          "routes.duration,routes.description,routes.routeLabels,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.transitDetails,routes.legs.steps.polyline",
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
        computeAlternativeRoutes: true,
        languageCode: "pt-BR",
        units: "METRIC",
      }),
      signal: AbortSignal.timeout(20000),
    }
  );

  const data = (await res.json()) as GoogleRoutesResponse;
  if (!res.ok || !data.routes?.length) {
    throw new Error(
      data.error?.message || "Google Routes não retornou trajeto TRANSIT"
    );
  }

  const parsed = uniqueTransitRoutes(
    data.routes
      .map((raw) => parseGoogleRouteRaw(raw))
      .filter((r): r is TransitRouteResult => r != null)
  );

  if (!parsed.length) {
    throw new Error("Google Routes não retornou passos TRANSIT utilizáveis");
  }

  return parsed;
}

/** Compat: primeira opção (recomendada pelo Google). */
export async function fetchGoogleTransitRoute(
  apiKey: string,
  originLat: number,
  originLng: number,
  direction: TripDirection = "ida"
): Promise<TransitRouteResult> {
  const routes = await fetchGoogleTransitRoutes(
    apiKey,
    originLat,
    originLng,
    direction
  );
  return routes[0];
}
