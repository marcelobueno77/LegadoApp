"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft, MapPin, Phone, Search } from "lucide-react";

type Role = "member" | "leader" | "director" | "admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  phone: string | null;
  city: string | null; // "Curitiba/PR"
  role: Role | null;
};

type CityLeaderRow = {
  cityName: string;
  uf: string;
  leaderName: string;
  phoneRaw: string | null;
  waLink: string | null;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function toWhatsAppLink(phone: string | null) {
  const digits = onlyDigits(phone || "");
  if (!digits) return null;

  // Se já vier com DDI (55...), mantém. Se vier com 10/11 dígitos, adiciona 55.
  const normalized = digits.startsWith("55") ? digits : `55${digits}`;
  return `https://wa.me/${normalized}`;
}

function splitCityUF(cityField: string | null) {
  const raw = (cityField || "").trim();
  if (!raw) return { cityName: "—", uf: "—" };

  const parts = raw.split("/");
  const cityName = (parts[0] || "").trim() || "—";
  const uf = (parts[1] || "").trim().toUpperCase() || "—";
  return { cityName, uf };
}

export default function CidadesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [rows, setRows] = useState<CityLeaderRow[]>([]);
  const [q, setQ] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setMsg("");
      setLoading(true);

      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;

      if (!mounted) return;

      setUser(sessionUser);

      if (!sessionUser) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .single();

      if (profErr) {
        setRole("member");
      } else {
        setRole((prof?.role ?? "member") as Role);
      }

      // ✅ Busca SOMENTE os líderes (role = leader) com cidade preenchida
      const { data: leaders, error } = await supabase
        .from("profiles")
        .select("id, full_name, phone, city, role")
        .eq("role", "leader")
        .not("city", "is", null);

      if (error) {
        setMsg(error.message);
        setRows([]);
        setLoading(false);
        return;
      }

      const profiles = (leaders || []) as ProfileRow[];

      // ✅ Se tiver mais de 1 líder na mesma cidade/UF, a gente:
      // - mantém 1 por cidade/UF (o primeiro por ordem alfabética do nome)
      const map = new Map<string, ProfileRow[]>();

      for (const p of profiles) {
        const { cityName, uf } = splitCityUF(p.city);
        const key = `${cityName}__${uf}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(p);
      }

      const finalRows: CityLeaderRow[] = [];

      for (const [key, list] of map.entries()) {
        const [cityName, uf] = key.split("__");

        const sorted = [...list].sort((a, b) =>
          (a.full_name || "").localeCompare(b.full_name || "")
        );

        const chosen = sorted[0];

        finalRows.push({
          cityName,
          uf,
          leaderName: chosen?.full_name || "—",
          phoneRaw: chosen?.phone ?? null,
          waLink: toWhatsAppLink(chosen?.phone ?? null),
        });
      }

      // ordena por UF depois cidade
      finalRows.sort((a, b) => {
        if (a.uf !== b.uf) return a.uf.localeCompare(b.uf);
        return a.cityName.localeCompare(b.cityName);
      });

      setRows(finalRows);
      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (!sessionUser) {
          router.replace("/login");
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", sessionUser.id)
          .single();

        setRole((prof?.role ?? "member") as Role);
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((r) => {
      const phone = (r.phoneRaw || "").toLowerCase();
      return (
        r.cityName.toLowerCase().includes(term) ||
        r.uf.toLowerCase().includes(term) ||
        r.leaderName.toLowerCase().includes(term) ||
        phone.includes(term)
      );
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    const ufs = new Set(rows.map((r) => r.uf).filter((x) => x && x !== "—"));
    const cities = new Set(
      rows.map((r) => `${r.cityName}__${r.uf}`).filter((x) => !x.startsWith("—"))
    );
    return { totalUF: ufs.size, totalCities: cities.size };
  }, [rows]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Carregando cidades…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold">Cidades</h1>
            </div>
          </div>

          <div className="hidden sm:block text-right">
            <p className="text-xs text-neutral-500">Logado como</p>
            <p className="text-sm font-semibold text-neutral-900 truncate max-w-[220px]">
              {user?.email}
            </p>
            <p className="text-xs text-neutral-500">
              Perfil:{" "}
              <span className="font-semibold text-neutral-700">{role}</span>
            </p>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        {/* Resumo */}
        <div className="mb-4 rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <p className="font-semibold">Resumo</p>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 ring-1 ring-neutral-200">
                <span className="text-neutral-600">Total de UF:</span>
                <span className="font-semibold text-neutral-900">
                  {totals.totalUF}
                </span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 ring-1 ring-neutral-200">
                <span className="text-neutral-600">Total de cidades:</span>
                <span className="font-semibold text-neutral-900">
                  {totals.totalCities}
                </span>
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cidade, UF, líder ou telefone…"
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>
        </div>

        {/* Lista */}
        <div className="grid grid-cols-1 gap-3">
          {filtered.map((r) => (
            <div
              key={`${r.cityName}__${r.uf}`}
              className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-neutral-900 truncate">
                      {r.cityName}
                    </p>
                    <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                      {r.uf}
                    </span>
                  </div>

                  <p className="mt-1 text-sm text-neutral-700">
                    <span className="text-neutral-500">Líder:</span>{" "}
                    <span className="font-semibold">{r.leaderName}</span>
                  </p>

                  <p className="mt-1 text-sm text-neutral-700">
                    <span className="text-neutral-500">Telefone:</span>{" "}
                    <span className="font-semibold">{r.phoneRaw || "—"}</span>
                  </p>
                </div>

                <div className="flex shrink-0 flex-col gap-2">
                  {r.waLink ? (
                    <a
                      href={r.waLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
                      title="Abrir WhatsApp"
                    >
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </a>
                  ) : (
                    <button
                      type="button"
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-100 px-3 py-2 text-sm font-semibold text-neutral-500 ring-1 ring-neutral-200 cursor-not-allowed"
                      title="Sem telefone cadastrado"
                      disabled
                    >
                      <Phone className="h-4 w-4" />
                      WhatsApp
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}

          {!filtered.length ? (
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-6 text-sm text-neutral-700">
              Nenhum resultado encontrado.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
