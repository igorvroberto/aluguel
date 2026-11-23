import { NextRequest, NextResponse } from "next/server";
import {
  buildFallbackTransitRoute,
  fetchGoogleTransitRoutes,
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
    const mapboxToken =
      process.env.NEXT_PUBLIC_MAPBOX_TOKEN || process.env.MAPBOX_TOKEN;

    if (!apiKey) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Configure GOOGLE_MAPS_API_KEY no servidor para usar os mesmos trajetos do Google Maps (ônibus, metrô e alternativas).",
          code: "missing_google_key",
        },
        { status: 503 }
      );
    }

    try {
      const routes = await fetchGoogleTransitRoutes(
        apiKey,
        lat,
        lng,
        direction
      );
      return NextResponse.json({
        ok: true,
        routes,
        route: routes[0],
        direction,
        source: "google",
        message:
          "Trajetos via Google Routes (TRANSIT), como no Maps — escolha a opção.",
      });
    } catch (err) {
      console.warn("Google TRANSIT falhou, fallback local:", err);
      const route = await buildFallbackTransitRoute(
        lat,
        lng,
        direction,
        mapboxToken,
        apiKey
      );
      return NextResponse.json({
        ok: true,
        routes: [route],
        route,
        direction,
        source: "local-fallback",
        warning:
          "Google Routes falhou agora. Estimativa local com paradas reais (seed/Places) — não é o Maps.",
      });
    }
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Falha ao calcular trajeto multimodal." },
      { status: 500 }
    );
  }
}
