import { NextResponse } from "next/server";

export const runtime = "nodejs";

function normalizeQuery(q: string) {
  return (q || "").trim().replace(/\s+/g, " ");
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const q = normalizeQuery(searchParams.get("q") || "");

  if (!q) {
    return NextResponse.json({ error: "missing q" }, { status: 400 });
  }

  // Nominatim (OpenStreetMap) - simples e gratuito (com limites)
  const url =
    "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=" +
    encodeURIComponent(q);

  try {
    const res = await fetch(url, {
      headers: {
        // importante pro Nominatim: identificar seu app
        "User-Agent": "LegadoApp/1.0 (geocoding)",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: `geocode_failed_${res.status}` },
        { status: 500 }
      );
    }

    const data = (await res.json()) as any[];

    if (!data?.length) {
      return NextResponse.json({ ok: true, found: false });
    }

    const first = data[0];
    const lat = Number(first.lat);
    const lng = Number(first.lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: true, found: false });
    }

    return NextResponse.json({
      ok: true,
      found: true,
      lat,
      lng,
      provider: "nominatim",
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "geocode_exception" },
      { status: 500 }
    );
  }
}
