import { NextRequest, NextResponse } from "next/server";
import {
  extractFromHtml,
  extractFromText,
  hasUsefulListingData,
  isBlockedResponse,
  type ExtractedListing,
} from "@/lib/listing-parser";

export const runtime = "nodejs";

const ALLOWED_HOST_HINTS = [
  "quintoandar",
  "zapimoveis",
  "vivareal",
  "imovelweb",
  "olx",
];

function isAllowedListingUrl(url: string): boolean {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol)) return false;
    const host = u.hostname.toLowerCase();
    return ALLOWED_HOST_HINTS.some((h) => host.includes(h));
  } catch {
    return false;
  }
}

async function fetchListingHtml(url: string): Promise<{
  status: number;
  html: string;
  blocked: boolean;
}> {
  const res = await fetch(url, {
    method: "GET",
    redirect: "follow",
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
      "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
      "Cache-Control": "no-cache",
    },
    signal: AbortSignal.timeout(15000),
  });

  const html = await res.text();
  return {
    status: res.status,
    html,
    blocked: isBlockedResponse(res.status, html),
  };
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as {
      url?: string;
      text?: string;
    };

    if (body.text && body.text.trim().length >= 20) {
      const data = extractFromText(body.text);
      return NextResponse.json({
        ok: true,
        mode: "text",
        data,
        blocked: false,
        message: hasUsefulListingData(data)
          ? "Dados extraídos do texto colado."
          : "Poucos dados encontrados no texto. Revise os campos manualmente.",
      });
    }

    const url = body.url?.trim();
    if (!url) {
      return NextResponse.json(
        { ok: false, error: "Informe a URL do anúncio ou cole o texto." },
        { status: 400 }
      );
    }

    if (!isAllowedListingUrl(url)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "URL não reconhecida. Use QuintoAndar, ZAP Imóveis, Viva Real ou Imovelweb — ou cole o texto do anúncio.",
          suggestPaste: true,
        },
        { status: 400 }
      );
    }

    let fetched: { status: number; html: string; blocked: boolean };
    try {
      fetched = await fetchListingHtml(url);
    } catch {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          suggestPaste: true,
          error:
            "Não foi possível acessar o anúncio (rede/timeout). Cole o texto da descrição no campo alternativo.",
        },
        { status: 502 }
      );
    }

    if (fetched.blocked) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          suggestPaste: true,
          error:
            "O portal bloqueou a leitura automática (anti-bot). Cole o texto da descrição do anúncio no campo \"Colar texto do anúncio\" para extrair os dados.",
        },
        { status: 403 }
      );
    }

    const data: ExtractedListing = extractFromHtml(fetched.html, url);
    if (!hasUsefulListingData(data)) {
      return NextResponse.json(
        {
          ok: false,
          blocked: false,
          suggestPaste: true,
          data,
          error:
            "Não encontramos endereço/valores suficientes na página. Cole o texto do anúncio para tentar novamente.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      ok: true,
      mode: "url",
      data,
      blocked: false,
      message: "Dados extraídos com sucesso. Revise antes de salvar.",
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json(
      {
        ok: false,
        error: "Falha inesperada ao extrair o anúncio.",
        suggestPaste: true,
      },
      { status: 500 }
    );
  }
}
