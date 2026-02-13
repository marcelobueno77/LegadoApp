import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type Role = "member" | "leader" | "director" | "admin";

function toTitleCasePtBR(input: string) {
  const raw = (input || "").trim().replace(/\s+/g, " ");
  if (!raw) return "";

  const lowerWords = new Set([
    "de",
    "da",
    "do",
    "das",
    "dos",
    "e",
    "em",
    "no",
    "na",
    "nos",
    "nas",
    "para",
    "por",
    "com",
    "a",
    "o",
    "as",
    "os",
  ]);

  const parts = raw.toLowerCase().split(" ");
  const out = parts.map((w, idx) => {
    if (!w) return w;
    if (idx !== 0 && lowerWords.has(w)) return w;
    return w.charAt(0).toUpperCase() + w.slice(1);
  });

  return out.join(" ");
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

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function cleanPhone(v: string | null) {
  const d = onlyDigits(v ?? "");
  return d ? v : null;
}

export async function POST(req: Request) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return NextResponse.json(
        { ok: false, message: "Env vars do Supabase não configuradas." },
        { status: 500 }
      );
    }

    // ✅ token do usuário (enviado pelo client)
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : "";

    if (!token) {
      return NextResponse.json(
        { ok: false, message: "Sem token de autenticação." },
        { status: 401 }
      );
    }

    // 1) valida usuário (com ANON)
    const supabaseAnon = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false },
    });

    const { data: userData, error: userErr } = await supabaseAnon.auth.getUser(token);
    if (userErr || !userData?.user) {
      return NextResponse.json(
        { ok: false, message: "Sessão inválida. Faça login novamente." },
        { status: 401 }
      );
    }

    const userId = userData.user.id;

    // 2) busca role (com ANON + token)
    const { data: prof, error: profErr } = await supabaseAnon
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json(
        { ok: false, message: "Erro ao verificar perfil/role." },
        { status: 403 }
      );
    }

    const role = (prof?.role ?? "member") as Role;
    const allowed = role === "leader" || role === "director" || role === "admin";
    if (!allowed) {
      return NextResponse.json(
        { ok: false, message: "🔒 Sem permissão para cadastrar cidades." },
        { status: 403 }
      );
    }

    // 3) lê payload
    const body = await req.json();

    const payload = {
      church_name: toTitleCasePtBR(String(body?.church_name ?? "")),
      address: toTitleCasePtBR(String(body?.address ?? "")),
      city_uf: normalizeCityUF(String(body?.city_uf ?? "")),
      cnpj: String(body?.cnpj ?? "").trim(),
      pastor_name: toTitleCasePtBR(String(body?.pastor_name ?? "")),
      leader_ministry_name: toTitleCasePtBR(String(body?.leader_ministry_name ?? "")),
      leader_phone: cleanPhone(String(body?.leader_phone ?? "").trim() || null),
    };

    if (
      !payload.church_name ||
      !payload.address ||
      !payload.city_uf ||
      !payload.cnpj ||
      !payload.pastor_name ||
      !payload.leader_ministry_name
    ) {
      return NextResponse.json(
        { ok: false, message: "Preencha todos os campos obrigatórios." },
        { status: 400 }
      );
    }

    // 4) INSERT com SERVICE ROLE (bypass RLS)
    const supabaseService = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false },
    });

    const { data, error } = await supabaseService
      .from("cities_registry")
      .insert(payload)
      .select("id, city_uf")
      .single();

    if (error) {
      const code = (error as any)?.code;

      if (code === "23505") {
        return NextResponse.json(
          { ok: false, message: `Essa cidade já está cadastrada: ${payload.city_uf}` },
          { status: 409 }
        );
      }

      return NextResponse.json(
        { ok: false, message: error.message },
        { status: 400 }
      );
    }

    return NextResponse.json({ ok: true, data }, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, message: e?.message || "Erro inesperado." },
      { status: 500 }
    );
  }
}
