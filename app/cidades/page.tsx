"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft, MapPin, Phone, Search } from "lucide-react";

type Role = "member" | "leader" | "director" | "admin";

type CityRegistryRow = {
  id: string;
  church_name: string;
  address: string;
  city_uf: string; // "Curitiba/PR"
  cnpj: string;
  pastor_name: string;
  leader_ministry_name: string;
  leader_phone: string | null;
};

type CityRow = {
  id: string;
  cityName: string;
  uf: string;
  churchName: string;
  pastorName: string;
  leaderMinistryName: string;
  phoneRaw: string | null;
  waLink: string | null;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function toWhatsAppLink(phone: string | null) {
  const digits = onlyDigits(phone || "");
  if (!digits) return null;
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

// Timeout simples para SELECT/lista
async function withTimeout<T>(promise: PromiseLike<T>, ms = 20000): Promise<T> {
  return await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao comunicar com o servidor.")), ms)
    ),
  ]);
}

export default function CidadesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingList, setLoadingList] = useState(true);

  const [msg, setMsg] = useState("");
  const [rows, setRows] = useState<CityRow[]>([]);
  const [q, setQ] = useState("");

  // evita rodar 2x no Strict Mode (dev)
  const ranRef = useRef(false);

  async function fetchCities() {
    setLoadingList(true);
    setMsg("");

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("cities_registry")
          .select(
            "id, church_name, address, city_uf, cnpj, pastor_name, leader_ministry_name, leader_phone"
          )
          .order("city_uf", { ascending: true }),
        20000
      );

      if (error) {
        setMsg(error.message);
        setRows([]);
        return;
      }

      const list = (data || []) as CityRegistryRow[];

      const finalRows: CityRow[] = list.map((c) => {
        const { cityName, uf } = splitCityUF(c.city_uf);
        const phone = c.leader_phone ?? null;

        return {
          id: c.id,
          cityName,
          uf,
          churchName: c.church_name || "—",
          pastorName: c.pastor_name || "—",
          leaderMinistryName: c.leader_ministry_name || "—",
          phoneRaw: phone,
          waLink: toWhatsAppLink(phone),
        };
      });

      // ordem por cidade/UF
      finalRows.sort((a, b) => {
        const c = a.cityName.localeCompare(b.cityName, "pt-BR");
        if (c !== 0) return c;
        return a.uf.localeCompare(b.uf, "pt-BR");
      });

      setRows(finalRows);
    } catch (e: any) {
      setMsg(e?.message || "Erro ao carregar cidades.");
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let mounted = true;

    async function load() {
      setLoadingPage(true);
      setMsg("");

      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;

      if (!mounted) return;

      setUser(sessionUser);

      if (!sessionUser) {
        setLoadingPage(false);
        router.replace("/login");
        return;
      }

      // Mantive role só pra exibir "perfil" no topo (não controla permissão aqui)
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .single();

      setRole((prof?.role ?? "member") as Role);

      setLoadingPage(false);
      fetchCities();
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
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
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const filtered = useMemo(() => {
    const termRaw = q.trim();
    if (!termRaw) return rows;

    const termLower = termRaw.toLowerCase();

    return rows.filter((r) => {
      const matchCity = r.cityName.toLowerCase().includes(termLower);
      const matchChurch = r.churchName.toLowerCase().includes(termLower);
      const matchPastor = r.pastorName.toLowerCase().includes(termLower);
      const matchLeader = r.leaderMinistryName.toLowerCase().includes(termLower);

      const matchUF = r.uf.toUpperCase().includes(termRaw.toUpperCase());

      const phone = (r.phoneRaw || "").toLowerCase();
      const matchPhone = phone.includes(termLower);

      return matchCity || matchUF || matchChurch || matchPastor || matchLeader || matchPhone;
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    const ufs = new Set(rows.map((r) => r.uf).filter((x) => x && x !== "—"));
    const cities = new Set(rows.map((r) => `${r.cityName}__${r.uf}`).filter((x) => !x.startsWith("—")));
    return { totalUF: ufs.size, totalCities: cities.size };
  }, [rows]);

  if (loadingPage) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* Topbar */}
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
              Perfil: <span className="font-semibold text-neutral-700">{role}</span>
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

        <div className="mb-4 rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-4">
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5" />
              <p className="font-semibold">Resumo</p>
            </div>

            <div className="flex items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 ring-1 ring-neutral-200">
                <span className="text-neutral-600">Total de UF:</span>
                <span className="font-semibold text-neutral-900">{totals.totalUF}</span>
              </span>

              <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 ring-1 ring-neutral-200">
                <span className="text-neutral-600">Total de cidades:</span>
                <span className="font-semibold text-neutral-900">{totals.totalCities}</span>
              </span>
            </div>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2">
            <Search className="h-4 w-4 text-neutral-500" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por cidade, UF (ex: PR), igreja, pastor, líder ou telefone…"
              className="w-full bg-transparent outline-none text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3">
          {loadingList ? (
            <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-6 text-sm text-neutral-700">
              Carregando lista de cidades…
            </div>
          ) : (
            <>
              {filtered.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-neutral-900 truncate">{r.cityName}</p>
                        <span className="inline-flex items-center rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                          {r.uf}
                        </span>
                      </div>

                      <p className="mt-2 text-sm text-neutral-700">
                        <span className="text-neutral-500">Igreja:</span>{" "}
                        <span className="font-semibold">{r.churchName}</span>
                      </p>

                      <p className="mt-1 text-sm text-neutral-700">
                        <span className="text-neutral-500">Pastor:</span>{" "}
                        <span className="font-semibold">{r.pastorName}</span>
                      </p>

                      <p className="mt-1 text-sm text-neutral-700">
                        <span className="text-neutral-500">Líder Ministério:</span>{" "}
                        <span className="font-semibold">{r.leaderMinistryName}</span>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
