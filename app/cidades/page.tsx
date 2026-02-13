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

// ✅ timeout simples p/ selects
async function withTimeout<T>(promise: PromiseLike<T>, ms = 20000): Promise<T> {
  return await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao comunicar com o servidor.")), ms)
    ),
  ]);
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function isAbortOrTimeout(err: any) {
  const msg = String(err?.message || err || "");
  return (
    (err as any)?.name === "AbortError" ||
    /abort|aborted|timeout|timed out/i.test(msg)
  );
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

  const ranRef = useRef(false);
  const mountedRef = useRef(true);

  const saveSeqRef = useRef(0);
  const saveAbortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      try {
        saveAbortRef.current?.abort();
      } catch {}
      saveAbortRef.current = null;
    };
  }, []);

  const canCreateCity = useMemo(
    () => role === "leader" || role === "director" || role === "admin",
    [role]
  );

  async function fetchCities() {
    setLoadingList(true);

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

  async function existsByCityUF(city_uf: string): Promise<boolean> {
    try {
      const { data, error } = await withTimeout(
        supabase.from("cities_registry").select("id").eq("city_uf", city_uf).limit(1),
        12000
      );
      if (error) return false;
      return !!(data && data.length);
    } catch {
      return false;
    }
  }

  function finishSuccess() {
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
    setMsg("✅ Cidade cadastrada com sucesso!");
    fetchCities();
  }

  async function handleSaveCity() {
    if (saving) return;

    setFormMsg("");
    setMsg("");

    const payload = {
      church_name: toTitleCasePtBR(form.church_name),
      address: toTitleCasePtBR(form.address),
      city_uf: normalizeCityUF(form.city_uf),
      cnpj: form.cnpj?.trim() ?? "",
      pastor_name: toTitleCasePtBR(form.pastor_name),
      leader_ministry_name: toTitleCasePtBR((form.leader_ministry_name || "").trim()),
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

    if (!canCreateCity) {
      setFormMsg("🔒 Sem permissão para cadastrar cidades.");
      return;
    }

    // mata save anterior pendurado
    try {
      saveAbortRef.current?.abort();
    } catch {}
    saveAbortRef.current = null;

    setSaving(true);
    const mySeq = ++saveSeqRef.current;

    const hardTimeoutMs = 20000;

    // watchdog final: garante que nunca fica preso
    const watchdog = setTimeout(async () => {
      if (!mountedRef.current) return;
      if (mySeq !== saveSeqRef.current) return;

      try {
        saveAbortRef.current?.abort();
      } catch {}

      // checa 2 vezes (agora e depois de 2s)
      const ok1 = await existsByCityUF(payload.city_uf);
      if (!mountedRef.current) return;
      if (mySeq !== saveSeqRef.current) return;
      if (ok1) {
        finishSuccess();
        setSaving(false);
        return;
      }

      await sleep(2000);
      const ok2 = await existsByCityUF(payload.city_uf);
      if (!mountedRef.current) return;
      if (mySeq !== saveSeqRef.current) return;
      if (ok2) {
        finishSuccess();
        setSaving(false);
        return;
      }

      setFormMsg("⏱️ Demorou demais para salvar. Tente novamente (pode ser instabilidade na conexão).");
      setSaving(false);
    }, hardTimeoutMs + 2500);

    try {
      // até 3 tentativas
      for (let attempt = 1; attempt <= 3; attempt++) {
        if (!mountedRef.current || mySeq !== saveSeqRef.current) return;

        const controller = new AbortController();
        saveAbortRef.current = controller;

        const abortTimer = setTimeout(() => {
          try {
            controller.abort();
          } catch {}
        }, hardTimeoutMs);

        try {
          const { error } = await supabase
            .from("cities_registry")
            .insert(payload)
            .abortSignal(controller.signal);

          clearTimeout(abortTimer);

          if (!mountedRef.current || mySeq !== saveSeqRef.current) return;

          if (!error) {
            finishSuccess();
            return;
          }

          const code = (error as any)?.code;
          const em = String(error.message || "");

          if (code === "23505") {
            setFormMsg(`Essa cidade já está cadastrada: ${payload.city_uf}`);
            return;
          }

          if (code === "42501" || /permission|policy|rls/i.test(em)) {
            setFormMsg("Sem permissão (RLS) para salvar. Fale com o admin para liberar o insert na tabela.");
            return;
          }

          // timeout/abort -> verifica se salvou e, se não, tenta novamente
          if (isAbortOrTimeout(error)) {
            const ok = await existsByCityUF(payload.city_uf);
            if (!mountedRef.current || mySeq !== saveSeqRef.current) return;
            if (ok) {
              finishSuccess();
              return;
            }

            // pequena pausa e retry
            await sleep(400 * attempt);
            continue;
          }

          // qualquer outro erro
          setFormMsg(em || "Erro ao salvar.");
          return;
        } catch (e: any) {
          clearTimeout(abortTimer);

          if (!mountedRef.current || mySeq !== saveSeqRef.current) return;

          if (isAbortOrTimeout(e)) {
            const ok = await existsByCityUF(payload.city_uf);
            if (!mountedRef.current || mySeq !== saveSeqRef.current) return;
            if (ok) {
              finishSuccess();
              return;
            }

            await sleep(400 * attempt);
            continue;
          }

          setFormMsg(e?.message || "Erro inesperado ao salvar.");
          return;
        }
      }

      // se chegou aqui: 3 tentativas falharam por timeout/instabilidade
      // último recurso: tenta UPSERT (se existir unique em city_uf)
      if (!mountedRef.current || mySeq !== saveSeqRef.current) return;

      const okBefore = await existsByCityUF(payload.city_uf);
      if (!mountedRef.current || mySeq !== saveSeqRef.current) return;
      if (okBefore) {
        finishSuccess();
        return;
      }

      const controllerUp = new AbortController();
      saveAbortRef.current = controllerUp;

      const abortUp = setTimeout(() => {
        try {
          controllerUp.abort();
        } catch {}
      }, 12000);

      try {
        const { error: upErr } = await supabase
          .from("cities_registry")
          .upsert(payload, { onConflict: "city_uf" })
          .abortSignal(controllerUp.signal);

        clearTimeout(abortUp);

        if (!mountedRef.current || mySeq !== saveSeqRef.current) return;

        if (!upErr) {
          finishSuccess();
          return;
        }

        const code = (upErr as any)?.code;
        const em = String(upErr.message || "");

        if (code === "42501" || /permission|policy|rls/i.test(em)) {
          setFormMsg("Sem permissão (RLS) para salvar. Fale com o admin para liberar o insert/upsert na tabela.");
          return;
        }

        if (isAbortOrTimeout(upErr)) {
          const okAfter = await existsByCityUF(payload.city_uf);
          if (okAfter) {
            finishSuccess();
            return;
          }
          setFormMsg("⏱️ Timeout ao salvar (conexão instável). Tente novamente.");
          return;
        }

        setFormMsg(em || "Erro ao salvar.");
        return;
      } catch (e: any) {
        clearTimeout(abortUp);

        if (!mountedRef.current || mySeq !== saveSeqRef.current) return;

        if (isAbortOrTimeout(e)) {
          const okAfter = await existsByCityUF(payload.city_uf);
          if (okAfter) {
            finishSuccess();
            return;
          }
          setFormMsg("⏱️ Timeout ao salvar (conexão instável). Tente novamente.");
          return;
        }

        setFormMsg(e?.message || "Erro inesperado ao salvar.");
        return;
      }
    } finally {
      clearTimeout(watchdog);
      if (mountedRef.current && mySeq === saveSeqRef.current) {
        setSaving(false);
      }
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
          <div className="absolute inset-0 bg-black/40" onClick={() => (saving ? null : setOpenForm(false))} />

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

              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome Líder Ministério</span>
                <input
                  value={form.leader_ministry_name}
                  onChange={(e) => {
                    setFormMsg("");
                    setForm((s) => ({ ...s, leader_ministry_name: e.target.value }));
                  }}
                  onBlur={() =>
                    setForm((s) => ({
                      ...s,
                      leader_ministry_name: toTitleCasePtBR(s.leader_ministry_name),
                    }))
                  }
                  placeholder="Digite o nome do líder…"
                  className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                />
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
