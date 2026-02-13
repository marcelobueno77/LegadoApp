"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft, MapPin, Phone, Search, Plus, X, Building2 } from "lucide-react";

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

type CityRegistryForm = {
  church_name: string;
  address: string;
  city_uf: string;
  cnpj: string;
  pastor_name: string;
  leader_ministry_name: string;
  leader_phone: string;
};

type LeaderOption = { id: string; full_name: string };

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

function isValidCityUF(v: string) {
  const norm = normalizeCityUF(v);
  if (!norm) return false;
  const parts = norm.split("/");
  const uf = parts[1] || "";
  return uf.length === 2;
}

// ✅ timeout (aceita PromiseLike para funcionar com PostgrestBuilder)
async function withTimeout<T>(promise: PromiseLike<T>, ms = 12000): Promise<T> {
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

  // Modal/form
  const [openForm, setOpenForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formMsg, setFormMsg] = useState("");
  const [form, setForm] = useState<CityRegistryForm>({
    church_name: "",
    address: "",
    city_uf: "",
    cnpj: "",
    pastor_name: "",
    leader_ministry_name: "",
    leader_phone: "",
  });

  // ✅ autocomplete líderes (mobile)
  const [leaderQuery, setLeaderQuery] = useState("");
  const [leaders, setLeaders] = useState<LeaderOption[]>([]);
  const [leaderLoading, setLeaderLoading] = useState(false);
  const [showLeaderDropdown, setShowLeaderDropdown] = useState(false);
  const leaderFetchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // controla concorrência
  const leaderReqIdRef = useRef(0);

  // container para clique fora
  const leaderBoxRef = useRef<HTMLDivElement | null>(null);

  // evita rodar 2x no Strict Mode (dev)
  const ranRef = useRef(false);

  const canCreateCity = useMemo(
    () => role === "leader" || role === "director" || role === "admin",
    [role]
  );

  async function fetchCities() {
    setLoadingList(true);

    const { data, error } = await supabase
      .from("cities_registry")
      .select(
        "id, church_name, address, city_uf, cnpj, pastor_name, leader_ministry_name, leader_phone"
      )
      .order("city_uf", { ascending: true });

    if (error) {
      setMsg(error.message);
      setRows([]);
      setLoadingList(false);
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
        churchName: c.church_name,
        pastorName: c.pastor_name,
        leaderMinistryName: c.leader_ministry_name || "—",
        phoneRaw: phone,
        waLink: toWhatsAppLink(phone),
      };
    });

    finalRows.sort((a, b) => {
      const c = a.cityName.localeCompare(b.cityName, "pt-BR");
      if (c !== 0) return c;
      return a.uf.localeCompare(b.uf, "pt-BR");
    });


    setRows(finalRows);
    setLoadingList(false);
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let mounted = true;

    async function load() {
      setMsg("");
      setLoadingPage(true);

      const { data } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;

      if (!mounted) return;

      setUser(sessionUser);

      if (!sessionUser) {
        setLoadingPage(false);
        router.replace("/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .single();

      if (profErr) setRole("member");
      else setRole((prof?.role ?? "member") as Role);

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

  // fecha dropdown clicando fora
  useEffect(() => {
    function onDown(ev: MouseEvent | TouchEvent) {
      const el = leaderBoxRef.current;
      const target = ev.target as Node | null;
      if (!el || !target) return;
      if (!el.contains(target)) setShowLeaderDropdown(false);
    }

    document.addEventListener("mousedown", onDown, { passive: true });
    document.addEventListener("touchstart", onDown, { passive: true });

    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("touchstart", onDown);
    };
  }, []);

  // limpa debounce ao desmontar
  useEffect(() => {
    return () => {
      if (leaderFetchTimer.current) clearTimeout(leaderFetchTimer.current);
    };
  }, []);

  const filtered = useMemo(() => {
    const termRaw = q.trim();
    if (!termRaw) return rows;

    const termLower = termRaw.toLowerCase();

    return rows.filter((r) => {
      const matchCity = r.cityName.toLowerCase().includes(termLower);
      const matchChurch = r.churchName.toLowerCase().includes(termLower);
      const matchPastor = r.pastorName.toLowerCase().includes(termLower);
      const matchLeader = r.leaderMinistryName.toLowerCase().includes(termLower);

      const matchUF = r.uf.includes(termRaw);

      const phone = (r.phoneRaw || "").toLowerCase();
      const matchPhone = phone.includes(termLower);

      return matchCity || matchUF || matchChurch || matchPastor || matchLeader || matchPhone;
    });
  }, [rows, q]);

  const totals = useMemo(() => {
    const ufs = new Set(rows.map((r) => r.uf).filter((x) => x && x !== "—"));
    const cities = new Set(
      rows.map((r) => `${r.cityName}__${r.uf}`).filter((x) => !x.startsWith("—"))
    );
    return { totalUF: ufs.size, totalCities: cities.size };
  }, [rows]);

  async function fetchLeaderOptions(term: string) {
    const t = term.trim();
    const reqId = ++leaderReqIdRef.current;

    if (t.length < 2) {
      setLeaders([]);
      setLeaderLoading(false);
      return;
    }

    setLeaderLoading(true);

    try {
      const { data, error } = await withTimeout(
        supabase
          .from("profiles")
          .select("id, full_name")
          .eq("role", "leader")
          .ilike("full_name", `%${t}%`)
          .order("full_name", { ascending: true })
          .limit(10),
        12000
      );

      if (reqId !== leaderReqIdRef.current) return;

      if (error) {
        console.error("Erro ao buscar líderes:", error);
        setLeaders([]);
        return;
      }

      const opts = (data || [])
        .map((x: any) => ({
          id: String(x.id),
          full_name: String(x.full_name || "").trim(),
        }))
        .filter((x: LeaderOption) => x.full_name);

      setLeaders(opts);
    } catch (e: any) {
      if (reqId !== leaderReqIdRef.current) return;
      console.error("Erro inesperado ao buscar líderes:", e);
      setLeaders([]);
    } finally {
      if (reqId === leaderReqIdRef.current) setLeaderLoading(false);
    }
  }

  function scheduleLeaderSearch(term: string) {
    if (leaderFetchTimer.current) clearTimeout(leaderFetchTimer.current);
    leaderFetchTimer.current = setTimeout(() => fetchLeaderOptions(term), 250);
  }

  function handlePickLeader(name: string) {
    setLeaderQuery(name);
    setForm((s) => ({ ...s, leader_ministry_name: name }));
    setShowLeaderDropdown(false);
    setLeaders([]);
    setLeaderLoading(false);
  }

  async function handleSaveCity() {
    if (saving) return;

    // ✅ ETAPA 2 — cancelar autocomplete pendente antes de salvar
    if (leaderFetchTimer.current) clearTimeout(leaderFetchTimer.current);
    leaderReqIdRef.current++; // invalida qualquer request em andamento
    setShowLeaderDropdown(false);
    setLeaderLoading(false);

    setFormMsg("");
    setMsg("");

    const payload = {
      church_name: toTitleCasePtBR(form.church_name),
      address: toTitleCasePtBR(form.address),
      city_uf: normalizeCityUF(form.city_uf),
      cnpj: form.cnpj?.trim() ?? "",
      pastor_name: toTitleCasePtBR(form.pastor_name),
      leader_ministry_name: form.leader_ministry_name?.trim() ?? "",
      leader_phone: (form.leader_phone?.trim() || null) as string | null,
    };

    if (
      !payload.church_name ||
      !payload.address ||
      !payload.city_uf ||
      !payload.cnpj ||
      !payload.pastor_name ||
      !payload.leader_ministry_name
    ) {
      setFormMsg("Preencha todos os campos obrigatórios.");
      return;
    }

    if (!isValidCityUF(payload.city_uf)) {
      setFormMsg('Cidade/UF inválido. Exemplo correto: "Curitiba/PR".');
      return;
    }

    // garante seleção da lista
    if (leaderQuery.trim() !== payload.leader_ministry_name.trim()) {
      setFormMsg("Selecione o líder na lista para manter o nome igual ao cadastro.");
      return;
    }

    if (!canCreateCity) {
      setFormMsg("🔒 Sem permissão para cadastrar cidades.");
      return;
    }

    setSaving(true);

    try {
      const { data: exists, error: existsErr } = await withTimeout(
        supabase.from("cities_registry").select("id").eq("city_uf", payload.city_uf).maybeSingle(),
        12000
      );

      if (existsErr) {
        setFormMsg(existsErr.message);
        return;
      }

      if ((exists as any)?.id) {
        setFormMsg(`Essa cidade já está cadastrada: ${payload.city_uf}`);
        return;
      }

      const { error } = await withTimeout(supabase.from("cities_registry").insert(payload), 12000);

      if (error) {
        const code = (error as any)?.code;
        if (code === "23505") {
          setFormMsg(`Essa cidade já está cadastrada: ${payload.city_uf}`);
        } else if (code === "42501" || /permission|policy|rls/i.test(error.message)) {
          setFormMsg("Sem permissão (RLS) para salvar. Fale com o admin para liberar o insert na tabela.");
        } else {
          setFormMsg(error.message);
        }
        return;
      }

      setOpenForm(false);
      setForm({
        church_name: "",
        address: "",
        city_uf: "",
        cnpj: "",
        pastor_name: "",
        leader_ministry_name: "",
        leader_phone: "",
      });
      setLeaderQuery("");
      setLeaders([]);
      setShowLeaderDropdown(false);
      setLeaderLoading(false);

      setMsg("✅ Cidade cadastrada com sucesso!");
      fetchCities();
    } catch (e: any) {
      setFormMsg(e?.message || "Erro inesperado ao salvar.");
    } finally {
      setSaving(false);
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
            <p className="text-sm font-semibold text-neutral-900 truncate max-w-[220px]">{user?.email}</p>
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

              {canCreateCity ? (
                <button
                  onClick={() => {
                    setFormMsg("");
                    setOpenForm(true);
                    // reset do autocomplete ao abrir
                    setLeaders([]);
                    setLeaderLoading(false);
                    setShowLeaderDropdown(false);
                  }}
                  className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
                >
                  <Plus className="h-4 w-4" />
                  Cadastrar cidade
                </button>
              ) : null}
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

      {/* Modal cadastrar cidade */}
      {openForm ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => (saving ? null : setOpenForm(false))}
          />

          <div className="relative w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-5">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <div className="h-10 w-10 rounded-xl bg-white ring-1 ring-neutral-200 flex items-center justify-center shadow">
                  <Building2 className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-bold text-neutral-900">Cadastrar cidade</p>
                  <p className="text-sm text-neutral-600">Informações da igreja/local.</p>
                </div>
              </div>

              <button
                onClick={() => (saving ? null : setOpenForm(false))}
                className="inline-flex items-center justify-center rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
                title="Fechar"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {formMsg ? (
              <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
                {formMsg}
              </div>
            ) : null}

            <div className="mt-4 grid grid-cols-1 gap-3">
              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome da Igreja</span>
                <input
                  value={form.church_name}
                  onChange={(e) => {
                    setFormMsg("");
                    setForm((s) => ({ ...s, church_name: e.target.value }));
                  }}
                  onBlur={() => setForm((s) => ({ ...s, church_name: toTitleCasePtBR(s.church_name) }))}
                  placeholder='Ex.: "Bola de Neve Curitiba"'
                  className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                />
              </label>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Endereço</span>
                <input
                  value={form.address}
                  onChange={(e) => {
                    setFormMsg("");
                    setForm((s) => ({ ...s, address: e.target.value }));
                  }}
                  onBlur={() => setForm((s) => ({ ...s, address: toTitleCasePtBR(s.address) }))}
                  placeholder="Rua, número, bairro..."
                  className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                />
              </label>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="text-sm">
                  <span className="block text-xs font-semibold text-neutral-700 mb-1">Cidade/UF</span>
                  <input
                    value={form.city_uf}
                    onChange={(e) => {
                      setFormMsg("");
                      setForm((s) => ({ ...s, city_uf: e.target.value }));
                    }}
                    onBlur={() => setForm((s) => ({ ...s, city_uf: normalizeCityUF(s.city_uf) }))}
                    placeholder='Ex.: "Curitiba/PR"'
                    className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                  />
                </label>

                <label className="text-sm">
                  <span className="block text-xs font-semibold text-neutral-700 mb-1">CNPJ</span>
                  <input
                    value={form.cnpj}
                    onChange={(e) => {
                      setFormMsg("");
                      setForm((s) => ({ ...s, cnpj: e.target.value }));
                    }}
                    placeholder="00.000.000/0000-00"
                    className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                  />
                </label>
              </div>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome do Pastor</span>
                <input
                  value={form.pastor_name}
                  onChange={(e) => {
                    setFormMsg("");
                    setForm((s) => ({ ...s, pastor_name: e.target.value }));
                  }}
                  onBlur={() => setForm((s) => ({ ...s, pastor_name: toTitleCasePtBR(s.pastor_name) }))}
                  placeholder="Nome completo"
                  className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                />
              </label>

              {/* ✅ AUTOCOMPLETE LÍDER */}
              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome Líder Ministério</span>

                <div className="relative" ref={leaderBoxRef}>
                  <input
                    value={leaderQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setFormMsg("");
                      setLeaderQuery(v);
                      setForm((s) => ({ ...s, leader_ministry_name: v }));
                      setShowLeaderDropdown(true);
                      scheduleLeaderSearch(v);
                    }}
                    onFocus={() => {
                      setShowLeaderDropdown(true);
                      scheduleLeaderSearch(leaderQuery);
                    }}
                    placeholder="Digite para buscar líderes cadastrados…"
                    className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                  />

                  {showLeaderDropdown ? (
                    <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-xl bg-white shadow-lg ring-1 ring-neutral-200">
                      <div className="px-3 py-2 text-xs text-neutral-600 border-b border-neutral-100 flex items-center justify-between">
                        <span>{leaderLoading ? "Buscando líderes..." : "Selecione um líder"}</span>
                        {leaderQuery.trim() ? (
                          <button
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => {
                              setLeaderQuery("");
                              setForm((s) => ({ ...s, leader_ministry_name: "" }));
                              setLeaders([]);
                              setLeaderLoading(false);
                              setShowLeaderDropdown(true);
                            }}
                            className="text-neutral-600 hover:text-neutral-900"
                            title="Limpar"
                          >
                            Limpar
                          </button>
                        ) : null}
                      </div>

                      {leaders.length ? (
                        <div className="max-h-[220px] overflow-auto">
                          {leaders.map((opt) => (
                            <button
                              key={opt.id}
                              type="button"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => handlePickLeader(opt.full_name)}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-neutral-50"
                            >
                              {opt.full_name}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <div className="px-3 py-3 text-sm text-neutral-600">
                          {leaderQuery.trim().length < 2
                            ? "Digite pelo menos 2 letras…"
                            : leaderLoading
                            ? "Carregando…"
                            : "Nenhum líder encontrado."}
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>

                <p className="mt-1 text-[11px] text-neutral-500">
                  Dica: selecione na lista para salvar o nome exatamente igual ao cadastro do perfil.
                </p>
              </label>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Telefone do Líder (WhatsApp)</span>
                <input
                  value={form.leader_phone}
                  onChange={(e) => {
                    setFormMsg("");
                    setForm((s) => ({ ...s, leader_phone: e.target.value }));
                  }}
                  placeholder="(41) 99999-9999"
                  className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                />
              </label>
            </div>

            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                onClick={() => (saving ? null : setOpenForm(false))}
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
                disabled={saving}
              >
                Cancelar
              </button>

              <button
                onClick={handleSaveCity}
                className="inline-flex items-center justify-center rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
                disabled={saving}
              >
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
