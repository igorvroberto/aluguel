import { NextRequest, NextResponse } from "next/server";
import {
  addApartments,
  deleteApartment,
  getApartmentsDataPath,
  listApartments,
  replaceApartments,
  updateApartment,
} from "@/lib/apartments-store";
import type { Apartment } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apartments = await listApartments();
    return NextResponse.json({
      ok: true,
      apartments,
      path: getApartmentsDataPath(),
      count: apartments.length,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Falha ao ler imóveis." },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      apartment?: Partial<Apartment>;
      apartments?: Array<Partial<Apartment>>;
      replace?: boolean;
    };

    if (body.replace && Array.isArray(body.apartments)) {
      const saved = await replaceApartments(body.apartments as Apartment[]);
      return NextResponse.json({
        ok: true,
        apartments: saved.apartments,
        persisted: saved.persisted,
        persistError: saved.persistError,
      });
    }

    const inputs = body.apartments
      ? body.apartments
      : body.apartment
        ? [body.apartment]
        : [];

    if (inputs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Informe apartment ou apartments." },
        { status: 400 }
      );
    }

    const result = await addApartments(inputs, { dedupeByUrl: true });
    return NextResponse.json({
      ok: true,
      apartments: result.apartments,
      added: result.added,
      skipped: result.skipped,
      persisted: result.persisted,
      persistError: result.persistError,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Falha ao salvar imóveis." },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      id?: string;
      patch?: Partial<Apartment>;
    };
    if (!body.id || !body.patch) {
      return NextResponse.json(
        { ok: false, error: "Informe id e patch." },
        { status: 400 }
      );
    }
    const result = await updateApartment(body.id, body.patch);
    if (!result.apartment) {
      return NextResponse.json(
        { ok: false, error: "Imóvel não encontrado." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      apartment: result.apartment,
      persisted: result.persisted,
      persistError: result.persistError,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Falha ao atualizar imóvel." },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = (await req.json()) as { id?: string };
    if (!body.id) {
      return NextResponse.json(
        { ok: false, error: "Informe id." },
        { status: 400 }
      );
    }
    const result = await deleteApartment(body.id);
    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: "Imóvel não encontrado." },
        { status: 404 }
      );
    }
    return NextResponse.json({
      ok: true,
      persisted: result.persisted,
      persistError: result.persistError,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      { ok: false, error: "Falha ao remover imóvel." },
      { status: 500 }
    );
  }
}
