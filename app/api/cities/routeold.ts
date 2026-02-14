import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function toTitleCasePtBR(input: string) {
  const raw = (input || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  const lowerWords = new Set([
    "de","da","do","das","dos","e","em","no","na","nos","nas","para","por","com","a","o","as","os",
  ]);

  const parts = raw.toLowerCase().split(" ");
  return parts
    .map((w, idx) => {
      if (!w) return w;
      if (idx !== 0 && lowerWords.has(w)) return w;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function normalizeCityUF(v: string) {
  const raw = (v || "").trim();
  if (!raw) return "";

  const cleaned = raw.replace(/\s*\/\s*/g, "/");
  const parts = cleaned.split("/");
  const cityRaw = (parts[0] || "").trim();
  const ufRaw = (parts[1] || "").trim();

  if (!cityRaw || !ufRaw) return "";

  const city = toTitleCasePtBR(cityRaw);
  const uf = ufRaw.toUpperCase();
  if (uf.length !== 2) return "";

  return `${city}/${uf}`;
}

function isValidCityUF(v: string) {
  const norm = normalizeCityUF(v);
  if (!norm) return false;
  const parts = norm.split("/");
  return (parts[1] || "").length === 2;
}

export async function POST(req: Request) {
  try {
    const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return NextResponse.json(
        { ok: false, message: "Env ausente: NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY" },
        { status: 500 }
      );
    }

    // ✅ Precisa ser sb_secret_... (bypass RLS)
    const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const body = await req.json().catch(() => null);

    const created_by = String(body?.created_by || "").trim();

    const payload = {
      created_by, // ✅ obrigatório no seu banco (NOT NULL)
      church_name: toTitleCasePtBR(body?.church_name || ""),
      address: toTitleCasePtBR(body?.address || ""),
      city_uf: normalizeCityUF(body?.city_uf || ""),
      cnpj: String(body?.cnpj || "").trim(),
      pastor_name: toTitleCasePtBR(body?.pastor_name || ""),
      leader_ministry_name: toTitleCasePtBR(body?.leader_ministry_name || ""),
      leader_phone: String(body?.leader_phone || "").trim() || null,
    };

    // Validações
    if (
      !payload.created_by ||
      !payload.church_name ||
      !payload.address ||
      !payload.city_uf ||
      !payload.cnpj ||
      !payload.pastor_name ||
      !payload.leader_ministry_name
    ) {
      return NextResponse.json(
        { ok: false, message: "Preencha todos os campos obrigatórios (incluindo created_by)." },
        { status: 400 }
      );
    }

    if (!isValidCityUF(payload.city_uf)) {
      return NextResponse.json(
        { ok: false, message: 'Cidade/UF inválido. Ex.: "Curitiba/PR".' },
        { status: 400 }
      );
    }

    // normaliza telefone
    if (payload.leader_phone) {
      const d = onlyDigits(payload.leader_phone);
      payload.leader_phone = d ? payload.leader_phone : null;
    }

    // ✅ (opcional mas recomendado) valida permissão pelo role no banco
    const { data: prof, error: profErr } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("id", payload.created_by)
      .single();

    if (profErr) {
      return NextResponse.json(
        { ok: false, message: "Não consegui validar o perfil do usuário.", code: "PROFILE_LOOKUP_FAIL" },
        { status: 403 }
      );
    }

    const role = String(prof?.role || "member");
    const allowed = role === "leader" || role === "director" || role === "admin";
    if (!allowed) {
      return NextResponse.json(
        { ok: false, message: "Sem permissão para cadastrar cidades." },
        { status: 403 }
      );
    }

    // INSERT
    const { data, error } = await supabaseAdmin
      .from("cities_registry")
      .insert(payload)
      .select("id, city_uf")
      .single();

    if (error) {
      const code = (error as any)?.code;

      if (code === "23505") {
        return NextResponse.json(
          { ok: false, message: `Essa cidade já está cadastrada: ${payload.city_uf}`, code },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { ok: false, message: error.message, code, details: (error as any)?.details },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, id: data?.id, city_uf: data?.city_uf });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "Erro inesperado." },
      { status: 500 }
    );
  }
}
