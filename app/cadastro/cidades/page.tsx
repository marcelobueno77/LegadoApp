"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  Building2,
  Save,
  X,
  MapPin,
  Phone,
  RefreshCw,
  Search,
  Pencil,
  Trash2,
  CheckCircle2,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

type Role = "member" | "leader" | "director" | "admin";

type CityRegistryRow = {
  id: string;
  created_at: string;
  created_by: string | null;
  church_name: string | null;
  address: string | null;
  city_uf: string | null; // UNIQUE
  cnpj: string | null;
  pastor_name: string | null;
  leader_ministry_name: string | null;
  leader_phone: string | null;

  // ✅ NOVO
  latitude: number | null;
  longitude: number | null;
  geocoded_at: string | null;
  geocode_provider: string | null;
};

type CityRegistryPayload = {
  church_name: string;
  address: string;
  city_uf: string;
  cnpj: string;
  pastor_name: string;
  leader_ministry_name: string;
  leader_phone: string | null;
};

function onlyDigits(v: string) {
  return (v || "").replace(/\D+/g, "");
}

function toWhatsAppDigits(phone: string) {
  const d = onlyDigits(phone);
  if (!d) return "";
  return d.startsWith("55") ? d : `55${d}`;
}

function toWhatsAppLink(phone: string | null) {
  const digits = toWhatsAppDigits(phone || "");
  if (!digits) return null;
  return `https://wa.me/${digits}`;
}

function safeText(v: string | null | undefined) {
  return (v || "").trim();
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
  return (parts[1] || "").length === 2;
}

async function withTimeout<T>(promise: PromiseLike<T>, ms = 20000): Promise<T> {
  return await Promise.race([
    Promise.resolve(promise),
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("Timeout ao comunicar com o servidor.")), ms)
    ),
  ]);
}

function isUniqueViolation(err: any) {
  const msg = String(err?.message || "").toLowerCase();
  const code = String(err?.code || "");
  if (code === "23505") return true;
  if (msg.includes("duplicate key value") || msg.includes("unique constraint")) return true;
  if (msg.includes("city_uf")) return true;
  return false;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export default function CadastroCidadesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");
  const [loadingPage, setLoadingPage] = useState(true);

  const [msg, setMsg] = useState<string>("");

  // LISTA + PAGINAÇÃO
  const [loadingList, setLoadingList] = useState(true);
  const [rows, setRows] = useState<CityRegistryRow[]>([]);
  const [searchInput, setSearchInput] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalCount, setTotalCount] = useState(0);

  // FORM
  const [saving, setSaving] = useState(false);
  const [mode, setMode] = useState<"create" | "edit">("create");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [form, setForm] = useState<CityRegistryPayload>({
    church_name: "",
    address: "",
    city_uf: "",
    cnpj: "",
    pastor_name: "",
    leader_ministry_name: "",
    leader_phone: null,
  });

  // ✅ GEO UPDATE (pendentes)
  const [geoRunning, setGeoRunning] = useState(false);
  const [geoDone, setGeoDone] = useState(0);
  const [geoTotal, setGeoTotal] = useState(0);
  const [geoErrors, setGeoErrors] = useState(0);

  const ranRef = useRef(false);

  const canManageCities = useMemo(() => role === "admin" || role === "director", [role]);

  const totalPages = useMemo(
    () => Math.max(1, Math.ceil(totalCount / pageSize)),
    [totalCount, pageSize]
  );

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

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .single();

      if (!mounted) return;

      setRole((prof?.role ?? "member") as Role);
      setLoadingPage(false);
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

  function resetForm() {
    setMode("create");
    setEditingId(null);
    setForm({
      church_name: "",
      address: "",
      city_uf: "",
      cnpj: "",
      pastor_name: "",
      leader_ministry_name: "",
      leader_phone: null,
    });
  }

  function fillFormFromRow(r: CityRegistryRow) {
    setMode("edit");
    setEditingId(r.id);
    setForm({
      church_name: safeText(r.church_name),
      address: safeText(r.address),
      city_uf: safeText(r.city_uf),
      cnpj: safeText(r.cnpj),
      pastor_name: safeText(r.pastor_name),
      leader_ministry_name: safeText(r.leader_ministry_name),
      leader_phone: r.leader_phone ? r.leader_phone : null,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function validateAndBuildPayload(): CityRegistryPayload | null {
    const payload: CityRegistryPayload = {
      church_name: toTitleCasePtBR(form.church_name),
      address: toTitleCasePtBR(form.address),
      city_uf: normalizeCityUF(form.city_uf),
      cnpj: (form.cnpj || "").trim(),
      pastor_name: toTitleCasePtBR(form.pastor_name),
      leader_ministry_name: toTitleCasePtBR(form.leader_ministry_name),
      leader_phone: (form.leader_phone ? form.leader_phone.trim() : "") || null,
    };

    if (
      !payload.church_name ||
      !payload.address ||
      !payload.city_uf ||
      !payload.cnpj ||
      !payload.pastor_name ||
      !payload.leader_ministry_name
    ) {
      setMsg("⚠️ Preencha todos os campos obrigatórios.");
      return null;
    }

    if (!isValidCityUF(payload.city_uf)) {
      setMsg('⚠️ Cidade/UF inválido. Use o formato: "Curitiba/PR".');
      return null;
    }

    if (payload.leader_phone) {
      const d = onlyDigits(payload.leader_phone);
      if (d.length < 10) {
        setMsg("⚠️ Telefone inválido. Informe DDD + número.");
        return null;
      }
    }

    return payload;
  }

  async function fetchCities(opts?: { keepPage?: boolean }) {
    setLoadingList(true);
    setMsg("");

    try {
      const term = searchTerm.trim();
      const like = term ? `%${term}%` : "";

      // COUNT
      let countQuery = supabase
        .from("cities_registry")
        .select("id", { count: "exact", head: true });

      if (term) {
        countQuery = countQuery.or(
          [
            `city_uf.ilike.${like}`,
            `church_name.ilike.${like}`,
            `pastor_name.ilike.${like}`,
            `leader_ministry_name.ilike.${like}`,
            `leader_phone.ilike.${like}`,
            `cnpj.ilike.${like}`,
            `address.ilike.${like}`,
          ].join(",")
        );
      }

      const countRes: any = await withTimeout(countQuery, 20000);
      const count = countRes.count ?? 0;
      setTotalCount(count);

      const nextTotalPages = Math.max(1, Math.ceil(count / pageSize));
      let nextPage = opts?.keepPage ? page : 1;
      if (nextPage > nextTotalPages) nextPage = nextTotalPages;
      if (nextPage < 1) nextPage = 1;
      if (nextPage !== page) setPage(nextPage);

      const from = (nextPage - 1) * pageSize;
      const to = from + pageSize - 1;

      let dataQuery = supabase
        .from("cities_registry")
        .select(
          "id, created_at, created_by, church_name, address, city_uf, cnpj, pastor_name, leader_ministry_name, leader_phone, latitude, longitude, geocoded_at, geocode_provider"
        )
        .order("city_uf", { ascending: true })
        .range(from, to);

      if (term) {
        dataQuery = dataQuery.or(
          [
            `city_uf.ilike.${like}`,
            `church_name.ilike.${like}`,
            `pastor_name.ilike.${like}`,
            `leader_ministry_name.ilike.${like}`,
            `leader_phone.ilike.${like}`,
            `cnpj.ilike.${like}`,
            `address.ilike.${like}`,
          ].join(",")
        );
      }

      const { data, error } = await withTimeout(dataQuery, 20000);

      if (error) {
        setMsg(error.message);
        setRows([]);
        return;
      }

      setRows((data || []) as CityRegistryRow[]);
    } catch (e: any) {
      setMsg(e?.message || "Erro ao carregar cidades.");
      setRows([]);
    } finally {
      setLoadingList(false);
    }
  }

  useEffect(() => {
    if (!loadingPage && user && canManageCities) fetchCities({ keepPage: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingPage, user?.id, canManageCities]);

  useEffect(() => {
    if (!loadingPage && user && canManageCities) fetchCities({ keepPage: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, pageSize]);

  async function handleSave() {
    if (saving) return;
    setMsg("");

    if (!canManageCities) {
      setMsg("🔒 Você não tem permissão para gerenciar cidades (somente Diretoria/Admin).");
      return;
    }

    const payload = validateAndBuildPayload();
    if (!payload) return;

    setSaving(true);

    try {
      if (mode === "create") {
        const { error } = await withTimeout(supabase.from("cities_registry").insert(payload), 20000);

        if (error) {
          if (isUniqueViolation(error)) setMsg("⚠️ Já existe uma cidade cadastrada com esse Cidade/UF. (city_uf é único)");
          else setMsg(error.message);
          return;
        }

        setMsg("✅ Cidade cadastrada com sucesso!");
        resetForm();
        setPage(1);
        fetchCities({ keepPage: false });
        return;
      }

      if (!editingId) {
        setMsg("⚠️ Não foi possível identificar o item para edição.");
        return;
      }

      const { error } = await withTimeout(
        supabase.from("cities_registry").update(payload).eq("id", editingId),
        20000
      );

      if (error) {
        if (isUniqueViolation(error)) setMsg("⚠️ Já existe uma cidade cadastrada com esse Cidade/UF. (city_uf é único)");
        else setMsg(error.message);
        return;
      }

      setMsg("✅ Cidade atualizada com sucesso!");
      resetForm();
      fetchCities({ keepPage: true });
    } catch (e: any) {
      setMsg(e?.message || "Erro inesperado ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(row: CityRegistryRow) {
    setMsg("");

    const label = safeText(row.city_uf) || "essa cidade";
    const ok = window.confirm(`Tem certeza que deseja excluir ${label}?`);
    if (!ok) return;

    try {
      setSaving(true);
      const { error } = await withTimeout(supabase.from("cities_registry").delete().eq("id", row.id), 20000);

      if (error) {
        setMsg(error.message);
        return;
      }

      if (editingId === row.id) resetForm();

      setMsg("✅ Cidade excluída com sucesso!");
      fetchCities({ keepPage: true });
    } catch (e: any) {
      setMsg(e?.message || "Erro ao excluir.");
    } finally {
      setSaving(false);
    }
  }

  // ✅ botão: atualiza somente quem está sem lat/lng
  async function handleUpdateMissingCoords() {
    if (geoRunning || saving) return;
    setMsg("");

    if (!canManageCities) {
      setMsg("🔒 Somente Diretoria/Admin pode atualizar coordenadas.");
      return;
    }

    const ok = window.confirm(
      "Atualizar coordenadas pendentes?\n\nIsso vai buscar latitude/longitude apenas para registros que ainda estão vazios."
    );
    if (!ok) return;

    setGeoRunning(true);
    setGeoDone(0);
    setGeoTotal(0);
    setGeoErrors(0);

    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token || "";

      if (!token) {
        setMsg("Sessão inválida. Faça login novamente.");
        return;
      }

      // pega pendentes (lat OU lng vazios)
      const { data: pend, error: perr } = await withTimeout(
        supabase
          .from("cities_registry")
          .select("id, address, city_uf, latitude, longitude")
          .or("latitude.is.null,longitude.is.null")
          .order("created_at", { ascending: true })
          .limit(500),
        20000
      );

      if (perr) {
        setMsg(perr.message);
        return;
      }

      const pending = (pend || []) as any[];
      setGeoTotal(pending.length);

      if (!pending.length) {
        setMsg("✅ Nada para atualizar. Todas as cidades já têm coordenadas.");
        return;
      }

      for (let i = 0; i < pending.length; i++) {
        const r = pending[i];
        try {
          const res = await fetch("/api/geocode", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${token}`,
            },
            body: JSON.stringify({
              id: r.id,
              address: r.address,
              city_uf: r.city_uf,
            }),
          });

          if (!res.ok) {
            setGeoErrors((e) => e + 1);
          }

          setGeoDone((d) => d + 1);

          // ✅ delay pra não ficar pesado nem bater limite
          await sleep(900);
        } catch {
          setGeoErrors((e) => e + 1);
          setGeoDone((d) => d + 1);
          await sleep(900);
        }
      }

      setMsg(
        `✅ Atualização concluída. Processados: ${pending.length} • Erros: ${geoErrors}`
      );
      await fetchCities({ keepPage: true });
    } catch (e: any) {
      setMsg(e?.message || "Erro ao atualizar coordenadas.");
    } finally {
      setGeoRunning(false);
    }
  }

  const waPreview = useMemo(() => {
    const raw = form.leader_phone || "";
    const digits = toWhatsAppDigits(raw);
    if (!digits) return null;
    return `https://wa.me/${digits}`;
  }, [form.leader_phone]);

  if (loadingPage) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando…</p>
        </div>
      </div>
    );
  }

  if (!canManageCities) {
    return (
      <div className="min-h-screen bg-white text-neutral-900">
        <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
          <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
            <div className="text-right">
              <p className="text-xs text-neutral-500">Logado como</p>
              <p className="text-sm font-semibold text-neutral-900 truncate max-w-[240px]">{user?.email}</p>
              <p className="text-xs text-neutral-500">
                Perfil: <span className="font-semibold text-neutral-700">{role}</span>
              </p>
            </div>
          </div>
        </div>

        <div className="mx-auto max-w-5xl px-6 py-10">
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-6">
            <p className="text-lg font-bold">🔒 Acesso restrito</p>
            <p className="mt-2 text-sm text-neutral-700">
              Esta área é exclusiva para <b>Diretoria</b> e <b>Admin</b>.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const headerBadge =
    mode === "edit" ? (
      <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
        <CheckCircle2 className="h-4 w-4" />
        Editando
      </span>
    ) : (
      <span className="inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
        <Building2 className="h-4 w-4" />
        Novo cadastro
      </span>
    );

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
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
              <h1 className="text-lg font-bold">Cadastro de Cidades</h1>
            </div>
            {headerBadge}
          </div>

          {/* ✅ AÇÕES (inclui botão de coordenadas) */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => fetchCities({ keepPage: true })}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
              disabled={loadingList || geoRunning}
              title="Atualizar lista"
            >
              <RefreshCw className={`h-4 w-4 ${loadingList ? "animate-spin" : ""}`} />
              Atualizar
            </button>

            <button
              type="button"
              onClick={handleUpdateMissingCoords}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 transition disabled:opacity-60"
              disabled={geoRunning || saving}
              title="Busca latitude/longitude apenas para registros pendentes"
            >
              <MapPin className="h-4 w-4" />
              {geoRunning ? `Coordenadas ${geoDone}/${geoTotal}` : "Atualizar coordenadas"}
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 mt-0.5 text-neutral-600" />
            <div className="min-w-0">{msg}</div>
          </div>
        ) : null}

        {geoRunning ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-white px-4 py-3 text-sm text-neutral-800">
            <div className="flex items-center justify-between gap-3">
              <div className="font-semibold">Atualizando coordenadas…</div>
              <div className="text-neutral-600">
                {geoDone}/{geoTotal} • erros: {geoErrors}
              </div>
            </div>
            <div className="mt-2 h-2 w-full rounded-full bg-neutral-100 overflow-hidden">
              <div
                className="h-full bg-neutral-900"
                style={{
                  width: geoTotal ? `${Math.min(100, (geoDone / geoTotal) * 100)}%` : "0%",
                }}
              />
            </div>
            <p className="mt-2 text-xs text-neutral-500">
              Dica: esse processo usa delay pra não travar e não bater limite.
            </p>
          </div>
        ) : null}

        {/* FORM */}
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-5">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <div className="h-10 w-10 rounded-xl bg-white ring-1 ring-neutral-200 flex items-center justify-center shadow">
                <Building2 className="h-5 w-5" />
              </div>
              <div>
                <p className="font-bold text-neutral-900">{mode === "edit" ? "Editar cidade" : "Cadastrar cidade"}</p>
                <p className="text-sm text-neutral-600">
                  O campo <b>city_uf</b> é único. Padrão <b>Cidade/UF</b>. (Coords são geradas pelo botão)
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setMsg("");
                resetForm();
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
              disabled={saving || geoRunning}
            >
              <X className="h-4 w-4" />
              {mode === "edit" ? "Cancelar" : "Limpar"}
            </button>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-3">
            <label className="text-sm">
              <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome da Igreja *</span>
              <input
                value={form.church_name}
                onChange={(e) => setForm((s) => ({ ...s, church_name: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, church_name: toTitleCasePtBR(s.church_name) }))}
                className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs font-semibold text-neutral-700 mb-1">Endereço *</span>
              <input
                value={form.address}
                onChange={(e) => setForm((s) => ({ ...s, address: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, address: toTitleCasePtBR(s.address) }))}
                className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </label>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">Cidade/UF (único) *</span>
                <div className="flex items-center gap-2 rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2">
                  <MapPin className="h-4 w-4 text-neutral-500" />
                  <input
                    value={form.city_uf}
                    onChange={(e) => setForm((s) => ({ ...s, city_uf: e.target.value }))}
                    onBlur={() => setForm((s) => ({ ...s, city_uf: normalizeCityUF(s.city_uf) }))}
                    className="w-full bg-transparent outline-none text-sm"
                  />
                </div>
              </label>

              <label className="text-sm">
                <span className="block text-xs font-semibold text-neutral-700 mb-1">CNPJ *</span>
                <input
                  value={form.cnpj}
                  onChange={(e) => setForm((s) => ({ ...s, cnpj: e.target.value }))}
                  className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
                />
              </label>
            </div>

            <label className="text-sm">
              <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome do Pastor *</span>
              <input
                value={form.pastor_name}
                onChange={(e) => setForm((s) => ({ ...s, pastor_name: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, pastor_name: toTitleCasePtBR(s.pastor_name) }))}
                className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs font-semibold text-neutral-700 mb-1">Nome do Líder do Ministério *</span>
              <input
                value={form.leader_ministry_name}
                onChange={(e) => setForm((s) => ({ ...s, leader_ministry_name: e.target.value }))}
                onBlur={() => setForm((s) => ({ ...s, leader_ministry_name: toTitleCasePtBR(s.leader_ministry_name) }))}
                className="w-full rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 outline-none text-sm"
              />
            </label>

            <label className="text-sm">
              <span className="block text-xs font-semibold text-neutral-700 mb-1">Telefone do Líder (WhatsApp)</span>
              <div className="flex items-center gap-2 rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2">
                <Phone className="h-4 w-4 text-neutral-500" />
                <input
                  value={form.leader_phone ?? ""}
                  onChange={(e) => setForm((s) => ({ ...s, leader_phone: e.target.value || null }))}
                  className="w-full bg-transparent outline-none text-sm"
                />
              </div>
              {waPreview ? (
                <p className="mt-1 text-xs text-neutral-600">
                  Preview WhatsApp:{" "}
                  <a className="font-semibold underline" href={waPreview} target="_blank" rel="noreferrer">
                    abrir
                  </a>
                </p>
              ) : null}
            </label>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={handleSave}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 transition disabled:opacity-60"
                disabled={saving || geoRunning}
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : mode === "edit" ? "Salvar alterações" : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        {/* LISTA */}
        <div className="mt-6 rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-bold text-neutral-900">Cidades cadastradas</p>
              <p className="text-sm text-neutral-600">
                Total: <b>{totalCount}</b> • Página <b>{page}</b>/<b>{totalPages}</b>
              </p>
            </div>

            <div className="flex items-center gap-2">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setPage(1);
                }}
                className="rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none"
                disabled={geoRunning}
              >
                <option value={10}>10/página</option>
                <option value={20}>20/página</option>
                <option value={50}>50/página</option>
              </select>
            </div>
          </div>

          {/* BUSCA */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <div className="flex items-center gap-2 rounded-xl bg-white ring-1 ring-neutral-200 px-3 py-2 flex-1">
              <Search className="h-4 w-4 text-neutral-500" />
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Buscar por cidade/UF, igreja, pastor, líder, CNPJ, telefone ou endereço…"
                className="w-full bg-transparent outline-none text-sm"
                disabled={geoRunning}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    setSearchTerm(searchInput.trim());
                    setPage(1);
                    fetchCities({ keepPage: false });
                  }
                }}
              />
            </div>

            <button
              type="button"
              onClick={() => {
                setSearchTerm(searchInput.trim());
                setPage(1);
                fetchCities({ keepPage: false });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 transition"
              disabled={loadingList || geoRunning}
            >
              <Search className="h-4 w-4" />
              Buscar
            </button>

            <button
              type="button"
              onClick={() => {
                setSearchInput("");
                setSearchTerm("");
                setPage(1);
                fetchCities({ keepPage: false });
              }}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
              disabled={loadingList || geoRunning}
            >
              <X className="h-4 w-4" />
              Limpar
            </button>
          </div>

          {/* PAGINAÇÃO */}
          <div className="mt-4 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
              disabled={loadingList || page <= 1 || geoRunning}
            >
              <ChevronLeft className="h-4 w-4" />
              Anterior
            </button>

            <div className="text-sm text-neutral-600">
              Página <b>{page}</b> de <b>{totalPages}</b>
            </div>

            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 disabled:opacity-50"
              disabled={loadingList || page >= totalPages || geoRunning}
            >
              Próxima
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>

          {/* LISTA */}
          <div className="mt-4 grid grid-cols-1 gap-3">
            {loadingList ? (
              <div className="rounded-2xl bg-white ring-1 ring-neutral-200 p-6 text-sm text-neutral-700">
                Carregando lista…
              </div>
            ) : (
              <>
                {rows.map((r) => {
                  const wa = toWhatsAppLink(r.leader_phone);
                  const hasCoords = r.latitude != null && r.longitude != null;

                  return (
                    <div key={r.id} className="rounded-2xl bg-white ring-1 ring-neutral-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="font-bold text-neutral-900 truncate">{safeText(r.city_uf) || "—"}</p>

                            {hasCoords ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                                <MapPin className="h-3.5 w-3.5" />
                                coords ok
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                                <AlertTriangle className="h-3.5 w-3.5" />
                                sem coords
                              </span>
                            )}
                          </div>

                          <p className="mt-2 text-sm text-neutral-700">
                            <span className="text-neutral-500">Igreja:</span>{" "}
                            <span className="font-semibold">{safeText(r.church_name) || "—"}</span>
                          </p>

                          <p className="mt-1 text-sm text-neutral-700">
                            <span className="text-neutral-500">Pastor:</span>{" "}
                            <span className="font-semibold">{safeText(r.pastor_name) || "—"}</span>
                          </p>

                          <p className="mt-1 text-sm text-neutral-700">
                            <span className="text-neutral-500">Líder:</span>{" "}
                            <span className="font-semibold">{safeText(r.leader_ministry_name) || "—"}</span>
                          </p>

                          <p className="mt-1 text-sm text-neutral-700">
                            <span className="text-neutral-500">Telefone:</span>{" "}
                            <span className="font-semibold">{safeText(r.leader_phone) || "—"}</span>
                            {wa ? (
                              <a
                                href={wa}
                                target="_blank"
                                rel="noreferrer"
                                className="ml-2 inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200 hover:bg-neutral-200 transition"
                              >
                                <Phone className="h-3.5 w-3.5" />
                                WhatsApp
                              </a>
                            ) : null}
                          </p>

                          <p className="mt-1 text-sm text-neutral-700">
                            <span className="text-neutral-500">CNPJ:</span>{" "}
                            <span className="font-semibold">{safeText(r.cnpj) || "—"}</span>
                          </p>

                          <p className="mt-1 text-sm text-neutral-700">
                            <span className="text-neutral-500">Endereço:</span>{" "}
                            <span className="font-semibold">{safeText(r.address) || "—"}</span>
                          </p>
                        </div>

                        <div className="shrink-0 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => fillFormFromRow(r)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-3 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 transition"
                            disabled={saving || geoRunning}
                          >
                            <Pencil className="h-4 w-4" />
                            Editar
                          </button>

                          <button
                            type="button"
                            onClick={() => handleDelete(r)}
                            className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
                            disabled={saving || geoRunning}
                          >
                            <Trash2 className="h-4 w-4 text-red-600" />
                            Excluir
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!rows.length ? (
                  <div className="rounded-2xl bg-white ring-1 ring-neutral-200 p-6 text-sm text-neutral-700">
                    Nenhum resultado encontrado.
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
