import { NextResponse } from "next/server";

/**
 * Chave pública para Maps JavaScript API.
 * Preferência: NEXT_PUBLIC_* (build) → GOOGLE_MAPS_API_KEY (runtime no .env).
 * A chave de Maps JS é exposta no browser de propósito; restrinja por HTTP referrer.
 */
export async function GET() {
  const apiKey = (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ""
  ).trim();

  return NextResponse.json(
    {
      apiKey: apiKey || null,
      hasKey: Boolean(apiKey),
    },
    {
      headers: {
        "Cache-Control": "private, max-age=300",
      },
    }
  );
}
