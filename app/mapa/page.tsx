"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft, MapPin, Search, RefreshCw } from "lucide-react";


type Role = "member" | "leader" | "director" | "admin";

type CityRow = {
  id: string;
  city_uf: string | null;
  church_name: string | null;
  address: string | null;
  pastor_name: string | null;
  leader_ministry_name: string | null;
  leader_phone: string | null;
  lat: number | null;
  lng: number | null;
};

type LegadoMapProps = {
  rows: CityRow[];
  selectedId: string | null; // ✅ NOVO
  defaultCenter: [number, number];
  defaultZoom: number;
  target: { lat: number; lng: number } | null;
  makeWhatsAppLink: (phone: string | null) => string | null;
  safeText: (v: string | null | undefined) => string;
};

function safeText(v: string | null | undefined) {
  return (v || "").trim();
}

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function toWhatsAppLink(phone: string | null) {
  const d = onlyDigits(phone || "");
  if (!d) return null;
  const digits = d.startsWith("55") ? d : `55${d}`;
  return `https://wa.me/${digits}`;
}

// ✅ Mapa isolado (sem SSR)
const LegadoMap = dynamic<LegadoMapProps>(() => import("../../components/LegadoMap"), {
  ssr: false,
});

export default function MapaLegadoPage() {
  const router = useRouter();
  const params = useSearchParams();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [rows, setRows] = useState<CityRow[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const selected = useMemo(() => rows.find((r) => r.id === selectedId) || null, [rows, selectedId]);

  const target = useMemo(() => {
    if (selected?.lat == null || selected?.lng == null) return null;
    return { lat: selected.lat, lng: selected.lng };
  }, [selected]);

  const listFiltered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return rows;
    return rows.filter((r) => {
      const hay = [r.city_uf, r.church_name, r.pastor_name, r.leader_ministry_name, r.address]
        .map((x) => safeText(x).toLowerCase())
        .join(" | ");
      return hay.includes(term);
    });
  }, [rows, search]);

  async function load() {
    setLoading(true);
    setMsg("");

    const { data } = await supabase.auth.getSession();
    const sessionUser = data.session?.user ?? null;
    setUser(sessionUser);

    if (!sessionUser) {
      router.replace("/login");
      return;
    }

    const { data: prof } = await supabase.from("profiles").select("role").eq("id", sessionUser.id).single();
    setRole((prof?.role ?? "member") as Role);

    // ✅ só traz cidades com coords
    const { data: cities, error } = await supabase
      .from("cities_registry")
      .select("id, city_uf, church_name, address, pastor_name, leader_ministry_name, leader_phone, lat, lng")
      .not("lat", "is", null)
      .not("lng", "is", null)
      .order("city_uf", { ascending: true });

    if (error) {
      setMsg(error.message);
      setRows([]);
      setLoading(false);
      return;
    }

    const items = (cities || []) as CityRow[];
    setRows(items);

    // ✅ se vier ?city=Curitiba/PR -> auto seleciona
    const cityParam = (params.get("city") || "").trim();
    if (cityParam) {
      const found = items.find((x) => safeText(x.city_uf).toLowerCase() === cityParam.toLowerCase());
      if (found) setSelectedId(found.id);
    }

    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ✅ centro padrão do mapa (Brasil)
  const defaultCenter: [number, number] = [-14.235, -51.925];
  const defaultZoom = 4;

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando mapa…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-6xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold">Mapa do Legado</h1>
            </div>

            <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
              <MapPin className="h-4 w-4" />
              {rows.length} pins
            </span>
          </div>

          <button
            onClick={load}
            className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
            title="Recarregar"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-6xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-4">
          {/* SIDEBAR */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-4">
            <div className="flex items-center gap-2 rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2">
              <Search className="h-4 w-4 text-neutral-500" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar cidade, igreja, pastor, líder..."
                className="w-full bg-transparent outline-none text-sm"
              />
            </div>

            <div className="mt-3 max-h-[60vh] overflow-auto space-y-2 pr-1">
              {listFiltered.map((r) => (
                <button
                  key={r.id}
                  onClick={() => setSelectedId(r.id)}
                  className={`w-full text-left rounded-xl px-3 py-2 ring-1 transition ${
                    selectedId === r.id
                      ? "bg-neutral-900 text-white ring-neutral-900"
                      : "bg-white text-neutral-900 ring-neutral-200 hover:bg-neutral-50"
                  }`}
                >
                  <div className="font-semibold text-sm truncate">{safeText(r.city_uf) || "—"}</div>
                  <div
                    className={`text-xs mt-0.5 truncate ${
                      selectedId === r.id ? "text-white/80" : "text-neutral-600"
                    }`}
                  >
                    {safeText(r.church_name) || "—"}
                  </div>
                </button>
              ))}

              {!listFiltered.length ? <div className="text-sm text-neutral-600 mt-3">Nenhum resultado.</div> : null}
            </div>
          </div>

          {/* MAPA */}
          <div className="rounded-2xl overflow-hidden shadow-sm ring-1 ring-neutral-200">
            <div className="h-[70vh] w-full">
              <LegadoMap
                rows={rows}
                selectedId={selectedId} // ✅ NOVO
                defaultCenter={defaultCenter}
                defaultZoom={defaultZoom}
                target={target}
                makeWhatsAppLink={toWhatsAppLink}
                safeText={safeText}
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
