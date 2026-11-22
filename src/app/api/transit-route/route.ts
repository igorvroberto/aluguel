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
    };

    const lat = Number(body.lat);
    const lng = Number(body.lng);
    const direction: TripDirection =
      body.direction === "volta" ? "volta" : "ida";

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "lat/lng inválidos." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (apiKey) {
      try {
        const route = await fetchGoogleTransitRoute(
          apiKey,
          lat,
          lng,
          direction
        );
        return NextResponse.json({
          ok: true,
          route,
          direction,
          message: route.preferDirectWalk
            ? "A pé direto é mais rápido que transporte público neste trajeto."
            : "Trajeto via Google Routes API (TRANSIT).",
        });
      } catch (err) {
        console.warn("Google TRANSIT fallback:", err);
        const route = buildFallbackTransitRoute(lat, lng, direction);
        return NextResponse.json({
          ok: true,
          route,
          direction,
          warning:
            "Estimativa local — Google Routes indisponível no momento. Transporte só é sugerido se for mais rápido que a pé direto.",
          source: "local-fallback",
        });
      }
    }

    const route = buildFallbackTransitRoute(lat, lng, direction);
    return NextResponse.json({
      ok: true,
      route,
      direction,
      warning:
        "Estimativa local. Transporte público só entra se for mais rápido que ir a pé direto até o destino. Configure GOOGLE_MAPS_API_KEY para rotas oficiais.",
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
