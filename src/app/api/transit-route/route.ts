import { NextRequest, NextResponse } from "next/server";
import {
  buildFallbackTransitRoute,
  fetchGoogleTransitRoute,
} from "@/lib/transit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      lat?: number;
      lng?: number;
    };

    const lat = Number(body.lat);
    const lng = Number(body.lng);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: "lat/lng inválidos." },
        { status: 400 }
      );
    }

    const apiKey = process.env.GOOGLE_MAPS_API_KEY;

    if (apiKey) {
      try {
        const route = await fetchGoogleTransitRoute(apiKey, lat, lng);
        return NextResponse.json({
          ok: true,
          route,
          message: "Trajeto via Google Routes API (TRANSIT).",
        });
      } catch (err) {
        console.warn("Google TRANSIT fallback:", err);
        const route = buildFallbackTransitRoute(lat, lng);
        return NextResponse.json({
          ok: true,
          route,
          warning:
            "Estimativa local (estação/corredor mais próximo) — Google Routes indisponível no momento.",
          source: "local-fallback",
        });
      }
    }

    const route = buildFallbackTransitRoute(lat, lng);
    return NextResponse.json({
      ok: true,
      route,
      warning:
        "Estimativa local até a estação/corredor mais próximo. Para rotas oficiais do Google, configure a chave no .env da VPS e reinicie o container.",
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
