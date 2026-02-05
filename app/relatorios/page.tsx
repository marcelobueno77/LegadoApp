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
} from "lucide-react";

import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
} from "recharts";

type Role = "member" | "leader" | "admin";

/**
 * ✅ Seus dados (conforme você passou)
 */
const MEMBERS_TABLE = "profiles";
const COL_NAME = "full_name";
const COL_CITY = "city"; // "Curitiba/PR"
const COL_MEMBER_SINCE = "member_since"; // date
const COL_BAPTIZED = "baptized"; // boolean

type MemberRow = {
  id: string;
  full_name?: string | null;
  city?: string | null;
  member_since?: string | null;
  baptized?: boolean | null;
};

type ReportKey = "city" | "uf" | "time" | "baptized";

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
 * Paleta "colorida" (viva) — melhora muito a leitura
 */
const COLORS = [
  "#2563EB", // blue
  "#16A34A", // green
  "#F59E0B", // amber
  "#EF4444", // red
  "#8B5CF6", // violet
  "#06B6D4", // cyan
  "#DB2777", // pink
  "#84CC16", // lime
  "#F97316", // orange
  "#0EA5E9", // sky
  "#A855F7", // purple
  "#22C55E", // green2
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

  const canSeeReports = useMemo(
    () => role === "leader" || role === "admin",
    [role]
  );

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

      // role
      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      const r = (prof?.role ?? "member") as Role;
      setRole(r);

      if (!(r === "leader" || r === "admin")) {
        setMsg("🔒 Acesso permitido somente para Líderes e Admin.");
        setLoading(false);
        return;
      }

      // carregar membros
      const { data, error } = await supabase
        .from(MEMBERS_TABLE)
        .select(`id, ${COL_NAME}, ${COL_CITY}, ${COL_MEMBER_SINCE}, ${COL_BAPTIZED}`);

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

  const ufsDisponiveis = useMemo(() => {
    const set = new Set<string>();
    for (const m of members) {
      const { uf } = parseCityAndUF((m as any)[COL_CITY]);
      if (uf && uf !== "Não informado") set.add(uf);
    }
    const arr = Array.from(set).sort((a, b) => a.localeCompare(b));
    // garante que o filtro sempre caia em um UF válido
    return arr.length ? arr : ["PR"];
  }, [members]);

  useEffect(() => {
    // se o UF escolhido não existir (ou vazio), escolhe o primeiro disponível
    if (!ufsDisponiveis.includes(ufFilter)) {
      setUfFilter(ufsDisponiveis[0] ?? "PR");
    }
  }, [ufsDisponiveis, ufFilter]);

  const reportUF = useMemo<ChartDatum[]>(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const { uf } = parseCityAndUF((m as any)[COL_CITY]);
      const key = uf || "Não informado";
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
    return topNWithOthers(data, 10);
  }, [members]);

  const reportCityByUF = useMemo<ChartDatum[]>(() => {
    const counts = new Map<string, number>();

    for (const m of members) {
      const { city, uf } = parseCityAndUF((m as any)[COL_CITY]);
      if (uf !== ufFilter) continue;
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }

    const data = Array.from(counts.entries()).map(([name, value]) => ({ name, value }));
    // cidade costuma ter muita variação -> top 12 e “Outros”
    return topNWithOthers(data, 12);
  }, [members, ufFilter]);

  const reportTime = useMemo<ChartDatum[]>(() => {
    const buckets = ["Até 1 ano", "1 a 2 anos", "2 a 5 anos", "Mais de 5 anos", "Não informado"];
    const counts = new Map<string, number>(buckets.map((b) => [b, 0]));

    for (const m of members) {
      const b = bucketChurchTime((m as any)[COL_MEMBER_SINCE]);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }

    return buckets.map((name) => ({ name, value: counts.get(name) ?? 0 }))
      .filter((x) => x.value > 0);
  }, [members]);

  const reportBaptized = useMemo<ChartDatum[]>(() => {
    let yes = 0, no = 0, ni = 0;

    for (const m of members) {
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
  }, [members]);

  const chartTitle = useMemo(() => {
    if (activeReport === "city") return `Membros por Cidade (${ufFilter})`;
    if (activeReport === "uf") return "Membros por UF";
    if (activeReport === "time") return "Tempo de Igreja";
    return "Relatório de Batizados";
  }, [activeReport, ufFilter]);

  const currentChartData = useMemo<ChartDatum[]>(() => {
    if (activeReport === "city") return reportCityByUF;
    if (activeReport === "uf") return reportUF;
    if (activeReport === "time") return reportTime;
    return reportBaptized;
  }, [activeReport, reportCityByUF, reportUF, reportTime, reportBaptized]);

  const listData = useMemo(() => {
    // lista “inteligente” conforme relatório ativo
    const rows = members.map((m) => {
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

    if (activeReport === "city") {
      const filtered = rows.filter((r) => r.uf === ufFilter);
      return filtered.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }

    if (activeReport === "uf") {
      return rows.sort((a, b) => a.uf.localeCompare(b.uf) || a.name.localeCompare(b.name));
    }

    if (activeReport === "time") {
      return rows.sort((a, b) => a.sinceBucket.localeCompare(b.sinceBucket) || a.name.localeCompare(b.name));
    }

    // baptized
    return rows.sort((a, b) => a.baptized.localeCompare(b.baptized) || a.name.localeCompare(b.name));
  }, [members, activeReport, ufFilter]);

  const totalCurrent = useMemo(
    () => currentChartData.reduce((acc, x) => acc + x.value, 0),
    [currentChartData]
  );

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
            {msg || "🔒 Acesso permitido somente para Líderes e Admin."}
          </div>
        </div>
      </div>
    );
  }

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
            <div className="text-sm font-semibold truncate max-w-[260px]">
              {user?.email}
            </div>
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
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => { setActiveReport("uf"); setShowList(false); }}
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
            onClick={() => { setActiveReport("city"); setShowList(false); }}
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
            onClick={() => { setActiveReport("time"); setShowList(false); }}
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
            onClick={() => { setActiveReport("baptized"); setShowList(false); }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "baptized" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <BadgeCheck className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Batizados</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">Batizados vs não.</p>
          </button>
        </div>

        {/* Chart */}
        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <PieIcon className="h-5 w-5 text-neutral-800" />
              <h2 className="text-lg font-bold">{chartTitle}</h2>
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

          {/* Filtro UF (apenas no relatório por cidade) */}
          {activeReport === "city" ? (
            <div className="mt-4 flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="inline-flex items-center gap-2 text-sm font-semibold text-neutral-700">
                <Filter className="h-4 w-4" />
                Filtrar por UF:
              </div>

              <select
                value={ufFilter}
                onChange={(e) => setUfFilter(e.target.value)}
                className="w-full sm:w-[220px] rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              >
                {ufsDisponiveis.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>

              <div className="text-xs text-neutral-500">
                Total no UF:{" "}
                <span className="font-semibold text-neutral-700">{totalCurrent}</span>
              </div>
            </div>
          ) : (
            <div className="mt-4 text-xs text-neutral-500">
              Total: <span className="font-semibold text-neutral-700">{totalCurrent}</span>
            </div>
          )}

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-5 gap-6">
            {/* gráfico */}
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
                  >
                    {currentChartData.map((_, idx) => (
                      <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* legenda “boa no celular” */}
            <div className="lg:col-span-2">
              <div className="rounded-2xl ring-1 ring-neutral-200 bg-white overflow-hidden">
                <div className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-800">
                  Legenda
                </div>

                <div className="max-h-[320px] overflow-auto">
                  {currentChartData.map((d, idx) => (
                    <div
                      key={d.name + idx}
                      className="px-4 py-3 border-b border-neutral-100 flex items-center justify-between gap-3"
                    >
                      <div className="min-w-0 flex items-center gap-3">
                        <span
                          className="h-3 w-3 rounded-full shrink-0"
                          style={{ backgroundColor: COLORS[idx % COLORS.length] }}
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
                    </div>
                  ))}

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

          {/* List */}
          {showList ? (
            <div className="mt-6 rounded-2xl bg-white ring-1 ring-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-800">
                Lista — {listData.length} membros
              </div>

              <div className="max-h-[420px] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-white">
                    <tr className="text-left border-b border-neutral-200">
                      <th className="px-4 py-3">Nome</th>
                      <th className="px-4 py-3">Cidade</th>
                      <th className="px-4 py-3">UF</th>
                      <th className="px-4 py-3">Tempo</th>
                      <th className="px-4 py-3">Batizado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {listData.map((r) => (
                      <tr key={r.id} className="border-b border-neutral-100">
                        <td className="px-4 py-3">{r.name}</td>
                        <td className="px-4 py-3">{r.city}</td>
                        <td className="px-4 py-3">{r.uf}</td>
                        <td className="px-4 py-3">{r.sinceBucket}</td>
                        <td className="px-4 py-3">{r.baptized}</td>
                      </tr>
                    ))}
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
