import { NextRequest, NextResponse } from "next/server";
import {
  buildFallbackTransitRoute,
  fetchGoogleTransitRoute,
  type TripDirection,
} from "@/lib/transit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      lat?: number;
      lng?: number;
      direction?: TripDirection;
      /** Tempo a pé real (Mapbox) para comparar com TRANSIT. */
      directWalkMinutes?: number;
    };

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const direction: TripDirection =
      body.direction === "volta" ? "volta" : "ida";
    const directWalkMinutes =
      body.directWalkMinutes != null &&
      Number.isFinite(Number(body.directWalkMinutes))
        ? Number(body.directWalkMinutes)
        : undefined;

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "lat/lng inválidos." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;
    const mapboxToken =
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;

    if (apiKey) {
      try {
        const route = await fetchGoogleTransitRoute(
          apiKey,
          lat,
          lng,
          direction,
          directWalkMinutes
        );
        return NextResponse.json({
          ok: true,
          route,
          direction,
          message: route.preferDirectWalk
            ? "A pé direto é mais rápido que transporte público neste trajeto."
            : "Trajeto via Google Routes API (TRANSIT). Elevação usa só trechos Caminhe.",
        });
      } catch (err) {
        console.warn("Google TRANSIT fallback:", err);
        const route = await buildFallbackTransitRoute(
          lat,
          lng,
          direction,
          directWalkMinutes,
          mapboxToken
        );
        return NextResponse.json({
          ok: true,
          route,
          direction,
          warning:
            "Estimativa local — Google Routes indisponível. Elevação só nos trechos a pé até/da estação.",
          source: "local-fallback",
        });
      }
    }

    const route = await buildFallbackTransitRoute(
      lat,
      lng,
      direction,
      directWalkMinutes,
      mapboxToken
    );
    return NextResponse.json({
      ok: true,
      route,
      direction,
      warning:
        "Estimativa local. Elevação só nos trechos a pé (Caminhe) — sem metrô/ônibus.",
      source: "local",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Falha ao calcular trajeto multimodal." },
      { status: 500 }
    );
  }
}
