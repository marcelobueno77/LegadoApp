"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  List,
  MapPin,
  BadgeCheck,
  Clock3,
  Filter,
  PieChart as PieIcon,
  X,
  Users,
} from "lucide-react";

import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from "recharts";

type Role = "member" | "leader" | "director" | "admin";

/**
 * ✅ Permissão SOMENTE PARA ESTA PÁGINA (Relatórios)
 * Leader/Director/Admin veem relatórios dentro do escopo:
 * - leader: somente sua cidade
 * - director: somente seu UF
 * - admin: tudo
 */
const REPORTS_ALLOWED_ROLES: Role[] = ["leader", "director", "admin"];

/**
 * ✅ Seus dados (conforme você passou)
 */
const MEMBERS_TABLE = "profiles";
const COL_NAME = "full_name";
const COL_CITY = "city"; // "Curitiba/PR"
const COL_MEMBER_SINCE = "member_since"; // date
const COL_BAPTIZED = "baptized"; // boolean
const COL_PHONE = "phone"; // ✅ já existe
const COL_BIRTH_DATE = "birth_date"; // ✅ NOVO (confirmado)
const COL_ROLE = "role"; // ✅ NOVO (para mostrar o perfil no "Liderados")

type MemberRow = {
  id: string;
  full_name?: string | null;
  city?: string | null;
  member_since?: string | null;
  baptized?: boolean | null;
  phone?: string | null;
  birth_date?: string | null;
  role?: Role | null; // ✅ NOVO
};

type ReportKey = "city" | "uf" | "time" | "baptized" | "liderados";
type ChartDatum = { name: string; value: number };

function parseCityAndUF(cityRaw: string | null | undefined) {
  const raw = (cityRaw ?? "").trim();
  if (!raw) return { city: "Não informado", uf: "Não informado" };

  // Esperado: "Curitiba/PR"
  const parts = raw.split("/");
  const city = (parts[0] ?? "").trim() || "Não informado";
  const uf = (parts[1] ?? "").trim().toUpperCase() || "Não informado";
  return { city, uf };
}

function yearsBetween(dateIso: string) {
  const d = new Date(dateIso);
  if (Number.isNaN(d.getTime())) return null;

  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const years = diffMs / (1000 * 60 * 60 * 24 * 365.25);
  return years;
}

function bucketChurchTime(memberSinceIso: string | null | undefined) {
  if (!memberSinceIso) return "Não informado";
  const y = yearsBetween(memberSinceIso);
  if (y === null) return "Não informado";
  if (y < 1) return "Até 1 ano";
  if (y >= 1 && y < 2) return "1 a 2 anos";
  if (y >= 2 && y < 5) return "2 a 5 anos";
  return "Mais de 5 anos";
}

function topNWithOthers(arr: ChartDatum[], n: number) {
  const sorted = [...arr].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;

  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((acc, x) => acc + x.value, 0);
  return [...head, { name: "Outros", value: rest }];
}

function truncate(s: string, max = 18) {
  const t = (s ?? "").trim();
  if (t.length <= max) return t;
  return t.slice(0, max - 1) + "…";
}

function percent(part: number, total: number) {
  if (!total) return "0%";
  const p = (part / total) * 100;
  return `${p.toFixed(p >= 10 ? 0 : 1)}%`;
}

/**
 * ✅ Corrige bug de timezone:
 * Se vier "YYYY-MM-DD", NÃO use new Date() (UTC derruba 1 dia no Brasil).
 * Apenas formata string.
 */
function formatBirthDateBR(iso: string | null | undefined) {
  const raw = (iso ?? "").trim();
  if (!raw) return "—";

  // formato date do Postgres normalmente é YYYY-MM-DD
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m) {
    const dd = m[3];
    const mm = m[2];
    return `${dd}/${mm}`;
  }

  // fallback (se vier timestamp, etc.)
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return "—";

  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}`;
}

/** ✅ Normaliza telefone p/ link do WhatsApp (wa.me) */
function phoneToWhatsAppLink(phoneRaw: string | null | undefined) {
  const digits = (phoneRaw ?? "").replace(/\D/g, "");
  if (!digits) return null;

  if (digits.startsWith("55") && (digits.length === 12 || digits.length === 13)) {
    return `https://wa.me/${digits}`;
  }
  if (digits.length === 10 || digits.length === 11) {
    return `https://wa.me/55${digits}`;
  }
  return `https://wa.me/${digits}`;
}

/**
 * Paleta "colorida" (viva) — melhora muito a leitura
 */
const COLORS = [
  "#2563EB",
  "#16A34A",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
  "#DB2777",
  "#84CC16",
  "#F97316",
  "#0EA5E9",
  "#A855F7",
  "#22C55E",
];

export default function RelatoriosPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [activeReport, setActiveReport] = useState<ReportKey>("uf");
  const [showList, setShowList] = useState(false);

  // filtro extra para "por cidade"
  const [ufFilter, setUfFilter] = useState<string>("PR");

  // ✅ filtro de cidade selecionada (clicando no gráfico / legenda)
  const [cityFilter, setCityFilter] = useState<string | null>(null);

  // ✅ filtro de UF selecionado no card UF
  const [ufClickFilter, setUfClickFilter] = useState<string | null>(null);

  // ✅ dados do usuário logado (pra escopo)
  const [myCity, setMyCity] = useState<string>(""); // exemplo: Curitiba/PR
  const [myUF, setMyUF] = useState<string>(""); // exemplo: PR

  /**
   * ✅ Somente nesta página:
   * Leader/Director/Admin podem ver relatórios.
   */
  const canSeeReports = useMemo(() => {
    return REPORTS_ALLOWED_ROLES.includes(role);
  }, [role]);

  useEffect(() => {
    let alive = true;

    async function load() {
      setLoading(true);
      setMsg("");

      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user ?? null;

      if (!u) {
        router.replace("/login");
        return;
      }
      if (!alive) return;
      setUser(u);

      // role + minha cidade
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role, city")
        .eq("id", u.id)
        .single();

      if (profErr) {
        setMsg(`Erro ao carregar seu perfil: ${profErr.message}`);
        setLoading(false);
        return;
      }

      const r = (prof?.role ?? "member") as Role;
      const cityRaw = (prof?.city ?? "") as string;

      setRole(r);
      setMyCity(cityRaw);

      const { uf } = parseCityAndUF(cityRaw);
      setMyUF(uf);

      // 🔒 Se não for leader/director/admin, bloqueia apenas aqui nos relatórios
      if (!REPORTS_ALLOWED_ROLES.includes(r)) {
        setMsg("🔒 Acesso permitido somente para Líderes, Diretores e Admin.");
        setLoading(false);
        return;
      }

      // ✅ carregar membros (inclui role)
      const { data, error } = await supabase
        .from(MEMBERS_TABLE)
        .select(
          `id, ${COL_NAME}, ${COL_CITY}, ${COL_MEMBER_SINCE}, ${COL_BAPTIZED}, ${COL_PHONE}, ${COL_BIRTH_DATE}, ${COL_ROLE}`
        );

      if (!alive) return;

      if (error) {
        setMsg(`Erro ao carregar dados: ${error.message}`);
        setMembers([]);
      } else {
        setMembers((data ?? []) as MemberRow[]);
      }

      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  /**
   * ✅ Escopo de membros por perfil:
   * - admin: todos
   * - leader: somente mesma cidade (cityRaw igual)
   * - director: somente mesmo UF
   */
  const membersScoped = useMemo(() => {
    if (role === "admin") return members;

    if (role === "leader") {
      const my = (myCity ?? "").trim().toLowerCase();
      if (!my) return [];
      return members.filter(
        (m) => (((m as any)[COL_CITY] ?? "") as string).trim().toLowerCase() === my
      );
    }

    if (role === "director") {
      const uf = (myUF ?? "").trim().toUpperCase();
      if (!uf || uf === "Não informado") return [];
      return members.filter((m) => {
        const { uf: mUf } = parseCityAndUF((m as any)[COL_CITY]);
        return (mUf ?? "").toUpperCase() === uf;
      });
    }

    return [];
  }, [members, role, myCity, myUF]);

  // ✅ Sempre que eu tiver um UF definido e eu NÃO for admin, trava o ufFilter nele
  useEffect(() => {
    if (role !== "admin" && myUF && myUF !== "Não informado") {
      setUfFilter(myUF);
    }
  }, [role, myUF]);

  const ufsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const m of membersScoped) {
      const { uf } = parseCityAndUF((m as any)[COL_CITY]);
      if (uf && uf !== "Não informado") set.add(uf);
    }
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    return arr.length ? arr : [myUF || "PR"];
  }, [membersScoped, myUF]);

  useEffect(() => {
    // admin: mantém comportamento normal
    if (role === "admin") {
      if (!ufsDisponiveis.includes(ufFilter)) {
        setUfFilter(ufsDisponiveis[0] ?? "PR");
      }
      return;
    }

    // leader/director: garante sempre o UF do usuário
    if (myUF && myUF !== "Não informado") {
      setUfFilter(myUF);
    }
  }, [ufsDisponiveis, ufFilter, role, myUF]);

  const reportUF = useMemo<ChartDatum[]>(() => {
    const counts = new Map<string, number>();
    for (const m of membersScoped) {
      const { uf } = parseCityAndUF((m as any)[COL_CITY]);
      const key = uf || "Não informado";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
    return topNWithOthers(data, 10);
  }, [membersScoped]);

  // ✅ lista dos UFs "Top" (sem o Outros) — pra filtrar "Outros" corretamente no card UF
  const topUFNames = useMemo(() => {
    return reportUF.filter((d) => d.name !== "Outros").map((d) => d.name);
  }, [reportUF]);

  const reportCityByUF = useMemo<ChartDatum[]>(() => {
    const counts = new Map<string, number>();

    for (const m of membersScoped) {
      const { city, uf } = parseCityAndUF((m as any)[COL_CITY]);
      if (uf !== ufFilter) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }

    const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
    return topNWithOthers(data, 12);
  }, [membersScoped, ufFilter]);

  const topCityNames = useMemo(() => {
    return reportCityByUF.filter((d) => d.name !== "Outros").map((d) => d.name);
  }, [reportCityByUF]);

  // ✅ limpa o filtro de cidade quando mudar UF ou relatório
  useEffect(() => {
    setCityFilter(null);
  }, [ufFilter, activeReport]);

  // ✅ limpa o filtro de UF clicado quando sair do card UF
  useEffect(() => {
    if (activeReport !== "uf") setUfClickFilter(null);
  }, [activeReport]);

  const reportTime = useMemo<ChartDatum[]>(() => {
    const buckets = ["Até 1 ano", "1 a 2 anos", "2 a 5 anos", "Mais de 5 anos", "Não informado"];
    const counts = new Map<string, number>(buckets.map((b) => [b, 0]));

    for (const m of membersScoped) {
      const b = bucketChurchTime((m as any)[COL_MEMBER_SINCE]);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }

    return buckets.map((name) => ({ name, value: counts.get(name) ?? 0 })).filter((x) => x.value > 0);
  }, [membersScoped]);

  const reportBaptized = useMemo<ChartDatum[]>(() => {
    let yes = 0, no = 0, ni = 0;

    for (const m of membersScoped) {
      const v = (m as any)[COL_BAPTIZED];
      if (v === true) yes++;
      else if (v === false) no++;
      else ni++;
    }

    return [
      { name: "Batizados", value: yes },
      { name: "Não batizados", value: no },
      { name: "Não informado", value: ni },
    ].filter((x) => x.value > 0);
  }, [membersScoped]);

  /**
   * ✅ Relatório "Liderados" (agora com escopo por perfil) + perfil da pessoa (role)
   */
  const lideradosRows = useMemo(() => {
    const rows = membersScoped.map((m) => {
      const name = (((m as any)[COL_NAME] as string) ?? "(Sem nome)").trim();
      const cityRaw = (m as any)[COL_CITY] as string | null;
      const phoneRaw = (m as any)[COL_PHONE] as string | null;
      const birthRaw = (m as any)[COL_BIRTH_DATE] as string | null;
      const roleRaw = (m as any)[COL_ROLE] as Role | null;

      const { city, uf } = parseCityAndUF(cityRaw);
      const since = (m as any)[COL_MEMBER_SINCE] as string | null;
      const baptized = (m as any)[COL_BAPTIZED] as boolean | null;

      return {
        id: m.id,
        name,
        city,
        uf,
        role: (roleRaw ?? "member") as Role,
        phone: (phoneRaw ?? "").trim(),
        birth_date: (birthRaw ?? "").trim(),
        sinceBucket: bucketChurchTime(since),
        baptized: baptized === true ? "Sim" : baptized === false ? "Não" : "—",
      };
    });

    return rows.sort(
      (a, b) =>
        a.uf.localeCompare(b.uf) ||
        a.city.localeCompare(b.city) ||
        a.name.localeCompare(b.name)
    );
  }, [membersScoped]);

  const chartTitle = useMemo(() => {
    if (activeReport === "liderados") {
      if (role === "admin") return "Liderados (Admin) — todos os membros";
      if (role === "director") return `Liderados — UF ${myUF || "Não informado"}`;
      return `Liderados — ${myCity || "Cidade não informada"}`;
    }
    if (activeReport === "city") return `Membros por Cidade (${ufFilter})`;
    if (activeReport === "uf") return "Membros por UF";
    if (activeReport === "time") return "Tempo de Igreja";
    return "Relatório de Batizados";
  }, [activeReport, ufFilter, role, myCity, myUF]);

  const currentChartData = useMemo<ChartDatum[]>(() => {
    if (activeReport === "city") return reportCityByUF;
    if (activeReport === "uf") return reportUF;
    if (activeReport === "time") return reportTime;
    if (activeReport === "baptized") return reportBaptized;
    return [];
  }, [activeReport, reportCityByUF, reportUF, reportTime, reportBaptized]);

  const totalCurrent = useMemo(
    () => currentChartData.reduce((acc, x) => acc + x.value, 0),
    [currentChartData]
  );

  function toggleCityFilter(cityName: string) {
    if (activeReport !== "city") return;
    setCityFilter((prev) => (prev === cityName ? null : cityName));
    setShowList(true);
  }

  function toggleUfClickFilter(ufName: string) {
    if (activeReport !== "uf") return;
    setUfClickFilter((prev) => (prev === ufName ? null : ufName));
    setShowList(true);
  }

  const listData = useMemo(() => {
    // ✅ "Liderados"
    if (activeReport === "liderados") {
      return lideradosRows.map((r) => ({
        id: r.id,
        name: r.name,
        role: r.role,
        phone: r.phone || "—",
        birth_date: r.birth_date || null,
        city: r.city,
        uf: r.uf,
        sinceBucket: r.sinceBucket,
        baptized: r.baptized,
      }));
    }

    const rows = membersScoped.map((m) => {
      const name = (((m as any)[COL_NAME] as string) ?? "(Sem nome)").trim();
      const cityRaw = (m as any)[COL_CITY] as string | null;
      const { city, uf } = parseCityAndUF(cityRaw);
      const since = (m as any)[COL_MEMBER_SINCE] as string | null;
      const baptized = (m as any)[COL_BAPTIZED] as boolean | null;

      return {
        id: m.id,
        name,
        city,
        uf,
        sinceBucket: bucketChurchTime(since),
        baptized: baptized === true ? "Sim" : baptized === false ? "Não" : "—",
      };
    });

    // ✅ "Por Cidade"
    if (activeReport === "city") {
      let filtered = rows.filter((r) => r.uf === ufFilter);

      if (cityFilter) {
        if (cityFilter === "Outros") filtered = filtered.filter((r) => !topCityNames.includes(r.city));
        else filtered = filtered.filter((r) => r.city === cityFilter);
      }

      return filtered.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }

    // ✅ "Por UF" (novo comportamento: click abre lista do UF)
    if (activeReport === "uf") {
      let filtered = rows;

      if (ufClickFilter) {
        if (ufClickFilter === "Outros") {
          filtered = filtered.filter((r) => !topUFNames.includes(r.uf));
        } else {
          filtered = filtered.filter((r) => r.uf === ufClickFilter);
        }
      }

      return filtered.sort((a, b) => a.uf.localeCompare(b.uf) || a.name.localeCompare(b.name));
    }

    if (activeReport === "time") {
      return rows.sort(
        (a, b) => a.sinceBucket.localeCompare(b.sinceBucket) || a.name.localeCompare(b.name)
      );
    }

    return rows.sort(
      (a, b) => a.baptized.localeCompare(b.baptized) || a.name.localeCompare(b.name)
    );
  }, [
    membersScoped,
    activeReport,
    ufFilter,
    cityFilter,
    topCityNames,
    lideradosRows,
    ufClickFilter,
    topUFNames,
  ]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando relatórios…</p>
        </div>
      </div>
    );
  }

  if (!canSeeReports) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 p-6">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold">Relatórios</h1>
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>

          <div className="mt-6 rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-neutral-800">
            {msg || "🔒 Acesso permitido somente para Líderes, Diretores e Admin."}
          </div>
        </div>
      </div>
    );
  }

  const showChart = activeReport !== "liderados";
  const ufSelectDisabled = role !== "admin"; // leader/director não escolhem UF

  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Relatórios</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Visão geral do ministério (membros, distribuição e batismos).
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">{user?.email}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Perfil: <span className="font-semibold text-neutral-700">{role}</span>
            </div>

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-3 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>
          </div>
        </div>

        {msg ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        {/* Cards */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          <button
            onClick={() => {
              setActiveReport("uf");
              setShowList(false);
              setUfClickFilter(null);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "uf" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Por UF</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">Distribuição por estado.</p>
          </button>

          <button
            onClick={() => {
              setActiveReport("city");
              setShowList(false);
              if (role !== "admin" && myUF && myUF !== "Não informado") setUfFilter(myUF);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "city" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Por Cidade</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">Escolha o UF e veja as cidades.</p>
          </button>

          <button
            onClick={() => {
              setActiveReport("time");
              setShowList(false);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "time" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <Clock3 className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Tempo de Igreja</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">Faixas por tempo (anos).</p>
          </button>

          <button
            onClick={() => {
              setActiveReport("baptized");
              setShowList(false);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "baptized" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Batizados</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">Batizados vs não.</p>
          </button>

          {/* ✅ CARD: LIDERADOS */}
          <button
            onClick={() => {
              setActiveReport("liderados");
              setShowList(true);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "liderados" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Liderados</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              {role === "admin"
                ? "Lista completa (Admin)."
                : role === "director"
                ? "Membros do seu estado."
                : "Membros da sua cidade."}
            </p>
          </button>
        </div>

        {/* Chart / Lista */}
        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-neutral-800" />
              <h2 className="text-lg font-bold">{chartTitle}</h2>

              {/* badge do filtro de cidade */}
              {activeReport === "city" && cityFilter ? (
                <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-800 ring-1 ring-neutral-200">
                  Cidade: {truncate(cityFilter, 24)}
                  <button
                    type="button"
                    onClick={() => setCityFilter(null)}
                    className="inline-flex items-center justify-center rounded-full hover:bg-neutral-200 p-1 transition"
                    title="Limpar filtro de cidade"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}

              {/* ✅ badge do filtro de UF (card UF) */}
              {activeReport === "uf" && ufClickFilter ? (
                <span className="ml-2 inline-flex items-center gap-2 rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-800 ring-1 ring-neutral-200">
                  UF: {truncate(ufClickFilter, 24)}
                  <button
                    type="button"
                    onClick={() => setUfClickFilter(null)}
                    className="inline-flex items-center justify-center rounded-full hover:bg-neutral-200 p-1 transition"
                    title="Limpar filtro de UF"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-2 justify-between sm:justify-end">
              <button
                onClick={() => setShowList((v) => !v)}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <List className="h-4 w-4" />
                {showList ? "Ocultar lista" : "Ver lista"}
              </button>
            </div>
          </div>

          {activeReport === "city" ? (
            <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700">
                <Filter className="h-4 w-4" />
                Filtrar por UF:
              </div>

              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                disabled={ufSelectDisabled}
                className={`w-full sm:w-[220px] rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400
                  ${ufSelectDisabled ? "opacity-60 cursor-not-allowed" : ""}`}
              >
                {ufsDisponiveis.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>

              <div className="text-xs text-neutral-500">
                Total no UF: <span className="font-semibold text-neutral-700">{totalCurrent}</span>
              </div>
            </div>
          ) : showChart ? (
            <div className="mt-4 text-xs text-neutral-500">
              Total: <span className="font-semibold text-neutral-700">{totalCurrent}</span>
              {activeReport === "uf" ? (
                <span className="ml-2">
                  (Clique no gráfico/legenda para abrir a lista do UF)
                </span>
              ) : null}
            </div>
          ) : (
            <div className="mt-4 text-xs text-neutral-500">
              Total: <span className="font-semibold text-neutral-700">{listData.length}</span>
            </div>
          )}

          {showChart ? (
            <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
              <div className="lg:col-span-3 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={currentChartData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={70}
                      outerRadius={120}
                      paddingAngle={2}
                      onClick={(payload: any) => {
                        const name = payload?.name as string | undefined;
                        if (!name) return;

                        if (activeReport === "city") toggleCityFilter(name);
                        if (activeReport === "uf") toggleUfClickFilter(name);
                      }}
                      style={{
                        cursor:
                          activeReport === "city" || activeReport === "uf" ? "pointer" : "default",
                      }}
                    >
                      {currentChartData.map((d, idx) => {
                        const isSelectedCity =
                          activeReport === "city" && cityFilter && cityFilter === d.name;

                        const isSelectedUF =
                          activeReport === "uf" && ufClickFilter && ufClickFilter === d.name;

                        const dim =
                          (activeReport === "city" && cityFilter && !isSelectedCity) ||
                          (activeReport === "uf" && ufClickFilter && !isSelectedUF);

                        const selected = isSelectedCity || isSelectedUF;

                        return (
                          <Cell
                            key={idx}
                            fill={COLORS[idx % COLORS.length]}
                            opacity={selected ? 1 : dim ? 0.55 : 1}
                            stroke={selected ? "#111827" : undefined}
                            strokeWidth={selected ? 2 : 0}
                          />
                        );
                      })}
                    </Pie>

                    <Tooltip
                      formatter={(value: any, _name: any, props: any) => {
                        const v = Number(value ?? 0);
                        const label = props?.payload?.name ?? "";
                        return [`${v} (${percent(v, totalCurrent)})`, label];
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>

              <div className="lg:col-span-2">
                <div className="rounded-2xl ring-1 ring-neutral-200 bg-white overflow-hidden">
                  <div className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-800">
                    Legenda{" "}
                    {activeReport === "city" || activeReport === "uf"
                      ? "(clique para filtrar)"
                      : ""}
                  </div>

                  <div className="max-h-[320px] overflow-auto">
                    {currentChartData.map((d, idx) => {
                      const isSelected =
                        (activeReport === "city" && cityFilter === d.name) ||
                        (activeReport === "uf" && ufClickFilter === d.name);

                      return (
                        <button
                          type="button"
                          key={d.name + idx}
                          onClick={() => {
                            if (activeReport === "city") toggleCityFilter(d.name);
                            if (activeReport === "uf") toggleUfClickFilter(d.name);
                          }}
                          className={`w-full text-left px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-3
                            ${
                              activeReport === "city" || activeReport === "uf"
                                ? "hover:bg-neutral-50"
                                : ""
                            }
                            ${isSelected ? "bg-neutral-50" : ""}`}
                          style={{
                            cursor:
                              activeReport === "city" || activeReport === "uf"
                                ? "pointer"
                                : "default",
                          }}
                        >
                          <div className="min-w-0 flex items-center gap-3">
                            <span
                              className="h-3 w-3 rounded-full shrink-0"
                              style={{
                                backgroundColor: COLORS[idx % COLORS.length],
                                outline: isSelected ? "2px solid #111827" : "none",
                                outlineOffset: 2,
                              }}
                            />
                            <span className="text-sm text-neutral-800 truncate">
                              {truncate(d.name, 22)}
                            </span>
                          </div>

                          <div className="shrink-0 text-sm font-semibold text-neutral-900">
                            {d.value}{" "}
                            <span className="text-xs font-medium text-neutral-500">
                              ({percent(d.value, totalCurrent)})
                            </span>
                          </div>
                        </button>
                      );
                    })}

                    {!currentChartData.length ? (
                      <div className="px-4 py-6 text-sm text-neutral-600">
                        Sem dados para exibir.
                      </div>
                    ) : null}
                  </div>
                </div>

                <p className="mt-3 text-xs text-neutral-500">
                  No celular, a legenda fica rolável e os nomes grandes são encurtados pra facilitar.
                </p>
              </div>
            </div>
          ) : null}

          {/* List */}
          {showList ? (
            <div className="mt-6 rounded-2xl bg-white ring-1 ring-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-800 flex items-center justify-between gap-3">
                <span>Lista — {listData.length} membros</span>

                {activeReport === "city" && cityFilter ? (
                  <span className="text-xs font-semibold text-neutral-600">
                    Filtrado por: <span className="text-neutral-900">{cityFilter}</span>
                  </span>
                ) : null}

                {activeReport === "uf" && ufClickFilter ? (
                  <span className="text-xs font-semibold text-neutral-600">
                    Filtrado por UF: <span className="text-neutral-900">{ufClickFilter}</span>
                  </span>
                ) : null}
              </div>

              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left border-b border-neutral-200">
                      <th className="px-4 py-3">Nome</th>

                      {/* ✅ LIDERADOS: Perfil + Aniversário + Telefone */}
                      {activeReport === "liderados" ? (
                        <>
                          <th className="px-4 py-3">Perfil</th>
                          <th className="px-4 py-3">Aniversário</th>
                          <th className="px-4 py-3">Telefone</th>
                        </>
                      ) : null}

                      <th className="px-4 py-3">Cidade</th>
                      <th className="px-4 py-3">UF</th>
                      <th className="px-4 py-3">Tempo</th>
                      <th className="px-4 py-3">Batizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.map((r: any) => {
                      const wa = activeReport === "liderados" ? phoneToWhatsAppLink(r.phone) : null;

                      return (
                        <tr key={r.id} className="border-b border-neutral-100">
                          <td className="px-4 py-3">{r.name}</td>

                          {activeReport === "liderados" ? (
                            <>
                              <td className="px-4 py-3">{r.role}</td>
                              <td className="px-4 py-3">{formatBirthDateBR(r.birth_date)}</td>
                              <td className="px-4 py-3">
                                {wa ? (
                                  <a
                                    href={wa}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="font-semibold text-neutral-900 underline decoration-neutral-300 hover:decoration-neutral-900"
                                    title="Abrir conversa no WhatsApp"
                                  >
                                    {r.phone}
                                  </a>
                                ) : (
                                  <span className="text-neutral-700">{r.phone ?? "—"}</span>
                                )}
                              </td>
                            </>
                          ) : null}

                          <td className="px-4 py-3">{r.city}</td>
                          <td className="px-4 py-3">{r.uf}</td>
                          <td className="px-4 py-3">{r.sinceBucket}</td>
                          <td className="px-4 py-3">{r.baptized}</td>
                        </tr>
                      );
                    })}

                    {!listData.length ? (
                      <tr>
                        <td
                          colSpan={activeReport === "liderados" ? 8 : 5}
                          className="px-4 py-6 text-sm text-neutral-600"
                        >
                          Nenhum dado para exibir.
                        </td>
                      </tr>
                    ) : null}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
