import { NextRequest, NextResponse } from "next/server";
import { addApartments } from "@/lib/apartments-store";
import { scrapeStationsNative } from "@/lib/station-scrape";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      stationIds?: string[];
      radiusMeters?: number;
      maxPackage?: number;
      rooms?: Array<1 | 2 | 3>;
    };

    const stationIds = body.stationIds?.filter(Boolean) ?? [];
    if (stationIds.length === 0) {
      return NextResponse.json(
        {
          ok: false,
          error: "Selecione ao menos uma estação para varrer.",
        },
        { status: 400 }
      );
    }

    const radiusMeters = Number(body.radiusMeters) || 800;
    const maxPackage = Number(body.maxPackage) || 6000;
    const rooms = (body.rooms?.length ? body.rooms : [1, 2, 3]) as Array<
      1 | 2 | 3
    >;

    const result = await scrapeStationsNative({
      stationIds,
      radiusMeters,
      maxPackage,
      rooms,
      mapboxToken: process.env.NEXT_PUBLIC_MAPBOX_TOKEN,
    });

    if (result.apartments.length === 0) {
      return NextResponse.json({
        ok: true,
        apartments: [],
        added: 0,
        skipped: 0,
        scanned: result.scanned,
        portals: result.portals,
        warnings: result.warnings,
        message:
          "Varredura concluída sem novos imóveis no raio/orçamento. Os portais podem ter bloqueado a leitura ou não há anúncios compatíveis.",
      });
    }

    const saved = await addApartments(result.apartments, { dedupeByUrl: true });

    return NextResponse.json({
      ok: true,
      apartments: saved.apartments,
      added: saved.added.length,
      skipped: saved.skipped,
      scanned: result.scanned,
      portals: result.portals,
      warnings: result.warnings,
      persisted: saved.persisted,
      persistError: saved.persistError,
      message: saved.persisted
        ? `${saved.added.length} imóvel(is) salvos em data/apartments.json.`
        : `${saved.added.length} imóvel(is) no cache em memória (FS read-only). Use "Baixar JSON Atualizado".`,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Falha ao varrer imóveis nas estações.",
      },
      { status: 500 }
    );
  }
}
