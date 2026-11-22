import { BUS_CORRIDORS, DESTINATION, TRANSIT_STATIONS } from "./constants";

export type TransitStepMode = "WALK" | "BUS" | "SUBWAY" | "TRANSIT";

export interface TransitStep {
  mode: TransitStepMode;
  instruction: string;
  durationMinutes: number;
  distanceMeters?: number;
  lineName?: string;
}

export interface TransitRouteResult {
  source: "google" | "fallback";
  totalDurationMinutes: number;
  walkDurationMinutes: number;
  steps: TransitStep[];
  summary: string;
}

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
  // ~4.8 km/h urban walking
  return Math.max(1, Math.round(meters / 80));
}

function formatWalkTo(place: string, minutes: number): string {
  return `Caminhe ${minutes} min até ${place}`;
}

/** Heuristic multimodal plan using nearby stations / bus corridors. */
export function buildFallbackTransitRoute(
  originLat: number,
  originLng: number
): TransitRouteResult {
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
    ...BUS_CORRIDORS.map((c) => {
      const mid = c.coordinates[Math.floor(c.coordinates.length / 2)];
      return {
        kind: "bus" as const,
        name: c.name,
        lat: mid[1],
        lng: mid[0],
        lineLabel: c.lines[0],
        rideMinutes: 9,
      };
    }),
  ];

  const scored = hubs
    .map((h) => {
      const toHub = haversineMeters(originLat, originLng, h.lat, h.lng);
      const toDest = haversineMeters(
        h.lat,
        h.lng,
        DESTINATION.lat,
        DESTINATION.lng
      );
      const walkMin = walkMinutes(toHub) + walkMinutes(toDest);
      const total = walkMin + h.rideMinutes;
      return { hub: h, toHub, toDest, walkMin, total };
    })
    .sort((a, b) => a.total - b.total);

  const best = scored[0];
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
      instruction: formatWalkTo(DESTINATION.name, walkToDest),
      durationMinutes: walkToDest,
      distanceMeters: Math.round(best.toDest),
    },
  ];

  const walkDurationMinutes = walkToHub + walkToDest;
  const totalDurationMinutes = walkDurationMinutes + best.hub.rideMinutes;
  const summary = steps.map((s) => s.instruction).join(" → ");

  return {
    source: "fallback",
    totalDurationMinutes,
    walkDurationMinutes,
    steps,
    summary,
  };
}

interface GoogleRoutesResponse {
  routes?: Array<{
    duration?: string;
    legs?: Array<{
      stepsOverview?: {
        multiModalSegments?: Array<{
          stepStartIndex?: number;
          stepEndIndex?: number;
          navigationInstruction?: { instructions?: string };
          travelMode?: string;
        }>;
      };
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
  originLng: number
): Promise<TransitRouteResult> {
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
            latLng: { latitude: originLat, longitude: originLng },
          },
        },
        destination: {
          location: {
            latLng: {
              latitude: DESTINATION.lat,
              longitude: DESTINATION.lng,
            },
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
      const label = mode === "BUS" ? "Ônibus" : mode === "SUBWAY" ? "Metrô" : "Transporte";
      instruction = `${label} ${line} (${minutes} min)` + (arr ? ` → ${arr}` : "");
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

  return {
    source: "google",
    totalDurationMinutes,
    walkDurationMinutes,
    steps,
    summary: steps.map((s) => s.instruction).join(" → "),
  };
}
