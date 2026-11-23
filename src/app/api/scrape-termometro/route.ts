import { NextRequest, NextResponse } from "next/server";
import { addApartments } from "@/lib/apartments-store";
import { DEFAULT_MAX_PACKAGE } from "@/lib/constants";
import { fetchTermometroApartments } from "@/lib/termometro";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json().catch(() => ({}))) as {
      raio?: number;
      custoMax?: number;
      quartosMin?: number;
      vagasMin?: number;
      maxPages?: number;
      bairros?: string[];
    };

    const result = await fetchTermometroApartments({
      raio: Number(body.raio) || 2000,
      custoMax: Number(body.custoMax) || DEFAULT_MAX_PACKAGE,
      quartosMin: Number(body.quartosMin) || 2,
      vagasMin: Number(body.vagasMin) || 1,
      maxPages: Number(body.maxPages) || 3,
      bairros: body.bairros,
    });

    if (result.apartments.length === 0) {
      return NextResponse.json({
        ok: true,
        apartments: [],
        added: 0,
        skipped: 0,
        scanned: result.scanned,
        requests: result.requests,
        portals: result.fontes,
        warnings: result.warnings,
        message:
          "Termômetro não retornou anúncios novos para o raio/bairros. " +
          (result.warnings[0] || ""),
      });
    }

    const saved = await addApartments(result.apartments, { dedupeByUrl: true });

    return NextResponse.json({
      ok: true,
      apartments: saved.apartments,
      added: saved.added.length,
      skipped: saved.skipped,
      scanned: result.scanned,
      requests: result.requests,
      portals: result.fontes,
      warnings: result.warnings,
      persisted: saved.persisted,
      persistError: saved.persistError,
      message: saved.persisted
        ? `${saved.added.length} do Termômetro salvos (${result.scanned} lidos, ${saved.skipped} duplicados).`
        : `${saved.added.length} no cache em memória (FS read-only).`,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        ok: false,
        error:
          err instanceof Error
            ? err.message
            : "Falha ao importar do Termômetro.",
      },
      { status: 500 }
    );
  }
}
