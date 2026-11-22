import { METRO_STATIONS } from "../../data/linhasMetro";
import { BUS_LINES } from "./bus-lines";
import { DESTINATION } from "./constants";

export type TransitStepMode = "WALK" | "BUS" | "SUBWAY" | "TRANSIT";

export interface TransitStep {
  mode: TransitStepMode;
  instruction: string;
  durationMinutes: number;
  distanceMeters?: number;
  lineName?: string;
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
    // extremos + meio do corredor
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

/**
 * Heurística multimodal: estação/ponto perto da origem + perto do destino.
 * Compara com tempo a pé real (Mapbox) quando informado.
 */
export function buildFallbackTransitRoute(
  originLat: number,
  originLng: number,
  direction: TripDirection = "ida",
  directWalkMinutesOverride?: number
): TransitRouteResult {
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

  const walkToHubMin = walkMinutesFromMeters(originHub.distanceM);
  const walkFromHubMin = walkMinutesFromMeters(destHub.distanceM);
  const rideMin = rideMinutesBetween(originHub.hub, destHub.hub);
  const transitTotal = walkToHubMin + rideMin + walkFromHubMin;

  // Só prefere a pé se claramente mais rápido (margem 2 min evita empate injusto)
  if (directWalkMin + 2 < transitTotal) {
    const steps: TransitStep[] = [
      {
        mode: "WALK",
        instruction: `Vá a pé direto até ${toLabel} (${directWalkMin} min) — mais rápido que metrô/ônibus neste caso`,
        durationMinutes: directWalkMin,
        distanceMeters: Math.round(
          haversineMeters(fromLat, fromLng, toLat, toLng) * WALK_DETOUR
        ),
      },
    ];
    return {
      source: "walk-preferred",
      totalDurationMinutes: directWalkMin,
      walkDurationMinutes: directWalkMin,
      steps,
      summary: steps[0].instruction,
      preferDirectWalk: true,
      directWalkMinutes: directWalkMin,
    };
  }

  const mode: TransitStepMode =
    originHub.hub.kind === "station" || destHub.hub.kind === "station"
      ? "SUBWAY"
      : "BUS";
  const rideVerb = mode === "SUBWAY" ? "Metrô/ônibus" : "Ônibus";

  const steps: TransitStep[] = [
    {
      mode: "WALK",
      instruction: formatWalkTo(originHub.hub.name, walkToHubMin),
      durationMinutes: walkToHubMin,
      distanceMeters: Math.round(originHub.distanceM),
    },
  ];

  if (rideMin > 0) {
    steps.push({
      mode,
      instruction: `${rideVerb} ${originHub.hub.lineLabel} → ${destHub.hub.name} (${rideMin} min)`,
      durationMinutes: rideMin,
      lineName: originHub.hub.lineLabel,
    });
  }

  steps.push({
    mode: "WALK",
    instruction: formatWalkTo(toLabel, walkFromHubMin),
    durationMinutes: walkFromHubMin,
    distanceMeters: Math.round(destHub.distanceM),
  });

  const walkDurationMinutes = walkToHubMin + walkFromHubMin;

  return {
    source: "fallback",
    totalDurationMinutes: transitTotal,
    walkDurationMinutes,
    steps,
    summary: steps.map((s) => s.instruction).join(" → "),
    preferDirectWalk: false,
    directWalkMinutes: directWalkMin,
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
          "routes.duration,routes.legs.steps.staticDuration,routes.legs.steps.distanceMeters,routes.legs.steps.navigationInstruction,routes.legs.steps.travelMode,routes.legs.steps.transitDetails",
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

    return {
      mode,
      instruction: instruction.trim(),
      durationMinutes: minutes,
      distanceMeters: s.distanceMeters,
      lineName: line,
    };
  });

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
  };
}
