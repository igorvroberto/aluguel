import { BUS_LINES } from "./bus-lines";
import { DESTINATION, TRANSIT_STATIONS } from "./constants";

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

function walkMinutes(meters: number): number {
  // ~4.8 km/h
  return Math.max(1, Math.round(meters / 80));
}

function formatWalkTo(place: string, minutes: number): string {
  return `Caminhe ${minutes} min até ${place}`;
}

function busHubsNearFaculty(): Array<{
  name: string;
  lat: number;
  lng: number;
  lineLabel: string;
  rideMinutes: number;
}> {
  return BUS_LINES.map((line) => {
    // ponto do itinerário mais próximo da faculdade
    let best = line.coordinates[0];
    let bestD = Number.POSITIVE_INFINITY;
    for (const c of line.coordinates) {
      const d = haversineMeters(DESTINATION.lat, DESTINATION.lng, c[1], c[0]);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return {
      name: `Ponto ${line.code}`,
      lat: best[1],
      lng: best[0],
      lineLabel: `${line.code} (${line.name})`,
      rideMinutes: 10,
    };
  });
}

/**
 * Heurística: só sugere estação/ônibus se o tempo total multimodal
 * for menor que ir a pé direto até o destino.
 */
export function buildFallbackTransitRoute(
  originLat: number,
  originLng: number,
  direction: TripDirection = "ida"
): TransitRouteResult {
  // Ida: imóvel → destino; Volta: destino → imóvel (espelha origem/destino)
  const fromLat = direction === "ida" ? originLat : DESTINATION.lat;
  const fromLng = direction === "ida" ? originLng : DESTINATION.lng;
  const toLat = direction === "ida" ? DESTINATION.lat : originLat;
  const toLng = direction === "ida" ? DESTINATION.lng : originLng;
  const toLabel =
    direction === "ida" ? DESTINATION.name : "o imóvel";

  const directMeters = haversineMeters(fromLat, fromLng, toLat, toLng);
  const directWalkMin = walkMinutes(directMeters);

  type Hub = {
    kind: "station" | "bus";
    name: string;
    lat: number;
    lng: number;
    lineLabel: string;
    rideMinutes: number;
  };

  const hubs: Hub[] = [
    ...TRANSIT_STATIONS.map((s) => ({
      kind: "station" as const,
      name: s.name,
      lat: s.lat,
      lng: s.lng,
      lineLabel: s.line,
      rideMinutes: 8,
    })),
    ...busHubsNearFaculty().map((b) => ({
      kind: "bus" as const,
      ...b,
    })),
  ];

  const scored = hubs
    .map((h) => {
      const toHub = haversineMeters(fromLat, fromLng, h.lat, h.lng);
      const toDest = haversineMeters(h.lat, h.lng, toLat, toLng);
      const walkMin = walkMinutes(toHub) + walkMinutes(toDest);
      const total = walkMin + h.rideMinutes;
      return { hub: h, toHub, toDest, walkMin, total };
    })
    .sort((a, b) => a.total - b.total);

  const best = scored[0];

  // Transporte só vale se for mais rápido que a pé direto
  if (directWalkMin <= best.total) {
    const steps: TransitStep[] = [
      {
        mode: "WALK",
        instruction: `Vá a pé direto até ${toLabel} (${directWalkMin} min) — mais rápido que metrô/ônibus neste caso`,
        durationMinutes: directWalkMin,
        distanceMeters: Math.round(directMeters),
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

  const walkToHub = walkMinutes(best.toHub);
  const walkToDest = walkMinutes(best.toDest);
  const mode: TransitStepMode = best.hub.kind === "station" ? "SUBWAY" : "BUS";
  const rideVerb = best.hub.kind === "station" ? "Metrô/CPTM" : "Ônibus";

  const steps: TransitStep[] = [
    {
      mode: "WALK",
      instruction: formatWalkTo(best.hub.name, walkToHub),
      durationMinutes: walkToHub,
      distanceMeters: Math.round(best.toHub),
    },
    {
      mode,
      instruction: `${rideVerb} ${best.hub.lineLabel} (${best.hub.rideMinutes} min)`,
      durationMinutes: best.hub.rideMinutes,
      lineName: best.hub.lineLabel,
    },
    {
      mode: "WALK",
      instruction: formatWalkTo(toLabel, walkToDest),
      durationMinutes: walkToDest,
      distanceMeters: Math.round(best.toDest),
    },
  ];

  const walkDurationMinutes = walkToHub + walkToDest;
  const totalDurationMinutes = walkDurationMinutes + best.hub.rideMinutes;

  return {
    source: "fallback",
    totalDurationMinutes,
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
  direction: TripDirection = "ida"
): Promise<TransitRouteResult> {
  const from =
    direction === "ida"
      ? { lat: originLat, lng: originLng }
      : { lat: DESTINATION.lat, lng: DESTINATION.lng };
  const to =
    direction === "ida"
      ? { lat: DESTINATION.lat, lng: DESTINATION.lng }
      : { lat: originLat, lng: originLng };

  const directWalkMin = walkMinutes(
    haversineMeters(from.lat, from.lng, to.lat, to.lng)
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

  if (directWalkMin <= totalDurationMinutes) {
    const toLabel =
      direction === "ida" ? DESTINATION.name : "o imóvel";
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
