"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft, Save, RefreshCw } from "lucide-react";

type FormState = {
  church_name: string;
  address: string;
  city_uf: string; // "Curitiba/PR"
  cnpj: string;
  pastor_name: string;
  leader_ministry_name: string;
  leader_phone: string;
  lat: string;
  lng: string;
};

type Props = {
  mode: "create" | "edit";
  cityId?: string;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

export default function CityForm({ mode, cityId }: Props) {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loadingPage, setLoadingPage] = useState(true);
  const [saving, setSaving] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [msg, setMsg] = useState("");

  const [form, setForm] = useState<FormState>({
    church_name: "",
    address: "",
    city_uf: "",
    cnpj: "",
    pastor_name: "",
    leader_ministry_name: "",
    leader_phone: "",
    lat: "",
    lng: "",
  });

  function setField<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((s) => ({ ...s, [k]: v }));
  }

  function validate() {
    if (!form.city_uf.trim()) return "Informe Cidade/UF (ex: Curitiba/PR).";
    if (!form.church_name.trim()) return "Informe o nome da igreja.";
    if (!form.address.trim()) return "Informe o endereço.";
    if (!form.pastor_name.trim()) return "Informe o pastor.";
    if (!form.leader_ministry_name.trim()) return "Informe o líder do ministério.";

    if (form.lat.trim() && Number.isNaN(Number(form.lat))) {
      return "Latitude inválida.";
    }

    if (form.lng.trim() && Number.isNaN(Number(form.lng))) {
      return "Longitude inválida.";
    }

    return "";
  }

  async function loadSessionAndData() {
    setLoadingPage(true);
    setMsg("");

    const { data } = await supabase.auth.getSession();
    const sessionUser = data.session?.user ?? null;
    setUser(sessionUser);

    if (!sessionUser) {
      router.replace("/login");
      return;
    }

    if (mode === "edit" && cityId) {
      const { data: row, error } = await supabase
        .from("cities_registry")
        .select(
          "church_name, address, city_uf, cnpj, pastor_name, leader_ministry_name, leader_phone, lat, lng"
        )
        .eq("id", cityId)
        .single();

      if (error) {
        setMsg(error.message);
      } else if (row) {
        setForm({
          church_name: row.church_name ?? "",
          address: row.address ?? "",
          city_uf: row.city_uf ?? "",
          cnpj: row.cnpj ?? "",
          pastor_name: row.pastor_name ?? "",
          leader_ministry_name: row.leader_ministry_name ?? "",
          leader_phone: row.leader_phone ?? "",
          lat: row.lat != null ? String(row.lat) : "",
          lng: row.lng != null ? String(row.lng) : "",
        });
      }
    }

    setLoadingPage(false);
  }

  useEffect(() => {
    loadSessionAndData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, cityId]);

  async function handleSave() {
    setMsg("");
    const err = validate();
    if (err) {
      setMsg(err);
      return;
    }

    if (!user) {
      setMsg("Sessão inválida. Faça login novamente.");
      router.replace("/login");
      return;
    }

    setSaving(true);
    try {
      const latValue = form.lat.trim() ? Number(form.lat) : null;
      const lngValue = form.lng.trim() ? Number(form.lng) : null;

      const payload = {
        church_name: form.church_name.trim(),
        address: form.address.trim(),
        city_uf: form.city_uf.trim(),
        cnpj: form.cnpj.trim() || null,
        pastor_name: form.pastor_name.trim(),
        leader_ministry_name: form.leader_ministry_name.trim(),
        leader_phone: onlyDigits(form.leader_phone) || null,
        lat: latValue,
        lng: lngValue,
      };

      if (mode === "create") {
        const { error } = await supabase.from("cities_registry").insert({
          ...payload,
          created_by: user.id,
          geocoded_at: new Date().toISOString(),
          geocode_provider: "formulário",
        });

        if (error) {
          setMsg(error.message);
          return;
        }

        router.push("/cidades");
        return;
      }

      if (!cityId) {
        setMsg("ID inválido para edição.");
        return;
      }

      const { error } = await supabase.from("cities_registry").update(payload).eq("id", cityId);

      if (error) {
        setMsg(error.message);
        return;
      }

      router.push("/cidades");
    } catch (e: any) {
      setMsg(e?.message || "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleUpdateCoords() {
    setMsg("");

    if (mode !== "edit" || !cityId) {
      setMsg("Salve a cidade primeiro antes de atualizar coordenadas.");
      return;
    }

    const query = `${form.address} - ${form.city_uf}`.trim();
    if (!query) {
      setMsg("Informe endereço e cidade/UF para geocodificar.");
      return;
    }

    setGeoLoading(true);
    try {
      const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
        query
      )}`;

      const res = await fetch(url, {
        headers: {
          "Accept-Language": "pt-BR",
        },
      });

      if (!res.ok) {
        setMsg("Falha ao consultar geocodificação.");
        return;
      }

      const json = (await res.json()) as any[];
      if (!json?.length) {
        setMsg("Não encontrei coordenadas para esse endereço.");
        return;
      }

      const lat = Number(json[0].lat);
      const lng = Number(json[0].lon);

      if (Number.isNaN(lat) || Number.isNaN(lng)) {
        setMsg("Coordenadas inválidas retornadas.");
        return;
      }

      const { error } = await supabase
        .from("cities_registry")
        .update({
          lat,
          lng,
          geocoded_at: new Date().toISOString(),
          geocode_provider: "nominatim",
        })
        .eq("id", cityId);

      if (error) {
        setMsg(error.message);
        return;
      }

      setForm((s) => ({
        ...s,
        lat: String(lat),
        lng: String(lng),
      }));

      setMsg("✅ Coordenadas atualizadas com sucesso.");
    } catch (e: any) {
      setMsg(e?.message || "Erro ao atualizar coordenadas.");
    } finally {
      setGeoLoading(false);
    }
  }

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
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/cidades")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold">
                {mode === "create" ? "Cadastro de cidade" : "Editar cidade"}
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {mode === "edit" ? (
              <button
                onClick={handleUpdateCoords}
                disabled={geoLoading}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${geoLoading ? "animate-spin" : ""}`} />
                Atualizar coordenadas
              </button>
            ) : null}

            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-3xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-5 space-y-4">
          <div>
            <label className="text-sm font-semibold">Cidade/UF</label>
            <input
              value={form.city_uf}
              onChange={(e) => setField("city_uf", e.target.value)}
              placeholder="Ex: Curitiba/PR"
              className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Igreja</label>
            <input
              value={form.church_name}
              onChange={(e) => setField("church_name", e.target.value)}
              placeholder="Ex: Bola de Neve Curitiba"
              className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Endereço</label>
            <input
              value={form.address}
              onChange={(e) => setField("address", e.target.value)}
              placeholder="Rua, número, bairro..."
              className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold">CNPJ</label>
              <input
                value={form.cnpj}
                onChange={(e) => setField("cnpj", e.target.value)}
                placeholder="Opcional"
                className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Telefone do líder</label>
              <input
                value={form.leader_phone}
                onChange={(e) => setField("leader_phone", e.target.value)}
                placeholder="(DDD) 9xxxx-xxxx"
                className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
              <p className="mt-1 text-xs text-neutral-500">
                Dica: pode colar com espaços/traços — eu normalizo.
              </p>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold">Pastor</label>
            <input
              value={form.pastor_name}
              onChange={(e) => setField("pastor_name", e.target.value)}
              placeholder="Nome do pastor"
              className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
            />
          </div>

          <div>
            <label className="text-sm font-semibold">Líder do Ministério</label>
            <input
              value={form.leader_ministry_name}
              onChange={(e) => setField("leader_ministry_name", e.target.value)}
              placeholder="Nome do líder"
              className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-semibold">Latitude</label>
              <input
                value={form.lat}
                onChange={(e) => setField("lat", e.target.value)}
                placeholder="Ex: -25.4284"
                className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </div>

            <div>
              <label className="text-sm font-semibold">Longitude</label>
              <input
                value={form.lng}
                onChange={(e) => setField("lng", e.target.value)}
                placeholder="Ex: -49.2733"
                className="mt-1 w-full rounded-xl ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}