import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function normalizeQuery(q: string) {
  return (q || "").trim().replace(/\s+/g, " ");
}

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");

    if (!token) {
      return NextResponse.json({ error: "missing token" }, { status: 401 });
    }

    const body = await req.json();
    const { id, address, city_uf } = body;

    if (!id || !city_uf) {
      return NextResponse.json({ error: "missing data" }, { status: 400 });
    }

    const query = normalizeQuery(`${address || ""} ${city_uf}`);

    if (!query) {
      return NextResponse.json({ ok: false, reason: "empty_query" });
    }

    const url =
      "https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=0&q=" +
      encodeURIComponent(query);

    const geoRes = await fetch(url, {
      headers: {
        "User-Agent": "LegadoApp/1.0 (geocoding)",
        "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
      },
      cache: "no-store",
    });

    if (!geoRes.ok) {
      return NextResponse.json({ ok: false, reason: "geocode_failed" });
    }

    const data = (await geoRes.json()) as any[];

    if (!data?.length) {
      return NextResponse.json({ ok: false, reason: "not_found" });
    }

    const lat = Number(data[0].lat);
    const lng = Number(data[0].lon);

    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json({ ok: false, reason: "invalid_coords" });
    }

    // 🔐 cria cliente Supabase com token do usuário
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        global: {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        },
      }
    );

    const { error } = await supabase
      .from("cities_registry")
      .update({
        lat,
        lng,
        geocoded_at: new Date().toISOString(),
        geocode_provider: "nominatim",
      })
      .eq("id", id);

    if (error) {
      return NextResponse.json({ ok: false, reason: error.message });
    }

    return NextResponse.json({ ok: true, lat, lng });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: e?.message || "unexpected_error" },
      { status: 500 }
    );
  }
}
