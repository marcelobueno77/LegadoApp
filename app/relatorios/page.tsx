"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  BarChart3,
  PieChart as PieIcon,
  List,
  Users,
  MapPin,
  BadgeCheck,
  Clock3,
} from "lucide-react";

import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";

type Role = "member" | "leader" | "admin";

/**
 * ✅ AJUSTE AQUI CASO SEU BANCO TENHA NOMES DIFERENTES
 */
const MEMBERS_TABLE = "profiles";
const COL_NAME = "full_name"; // ex: "name"
const COL_CITY = "city"; // "Curitiba/PR"
const COL_CHURCH_SINCE = "member_since"; // date
const COL_BAPTIZED = "baptized"; // boolean

type MemberRow = {
  id: string;
  full_name?: string | null;
  city?: string | null;
  church_since?: string | null;
  baptized?: boolean | null;
  // se seus campos forem diferentes, o supabase ainda retorna
  // mas você vai ajustar acima e aqui não precisa mudar muito.
};

type ReportKey = "city" | "uf" | "time" | "baptized";

function parseCityAndUF(cityRaw: string | null | undefined) {
  const raw = (cityRaw ?? "").trim();
  if (!raw) return { city: "Não informado", uf: "—" };

  // formato esperado: "Curitiba/PR"
  const parts = raw.split("/");
  const city = (parts[0] ?? "").trim() || "Não informado";
  const uf = (parts[1] ?? "").trim().toUpperCase() || "—";
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

function bucketChurchTime(churchSinceIso: string | null | undefined) {
  if (!churchSinceIso) return "Não informado";
  const y = yearsBetween(churchSinceIso);
  if (y === null) return "Não informado";
  if (y < 1) return "Até 1 ano";
  if (y >= 1 && y < 2) return "1 a 2 anos";
  if (y >= 2 && y < 5) return "2 a 5 anos";
  return "Mais de 5 anos";
}

function topN<T extends { name: string; value: number }>(arr: T[], n: number) {
  const sorted = [...arr].sort((a, b) => b.value - a.value);
  if (sorted.length <= n) return sorted;
  const head = sorted.slice(0, n);
  const rest = sorted.slice(n).reduce((acc, x) => acc + x.value, 0);
  return [...head, { name: "Outros", value: rest } as T];
}

export default function RelatoriosPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [activeReport, setActiveReport] = useState<ReportKey>("city");
  const [showList, setShowList] = useState(false);

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
        .select(`id, ${COL_NAME}, ${COL_CITY}, ${COL_CHURCH_SINCE}, ${COL_BAPTIZED}`);

      if (!alive) return;

      if (error) {
        setMsg(
          `Erro ao carregar membros. Confirme o nome da tabela/colunas. (${error.message})`
        );
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

  const reportCity = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const { city } = parseCityAndUF((m as any)[COL_CITY]);
      counts.set(city, (counts.get(city) ?? 0) + 1);
    }
    const data = Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
    }));
    return topN(data, 12); // top 12 + Outros
  }, [members]);

  const reportUF = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of members) {
      const { uf } = parseCityAndUF((m as any)[COL_CITY]);
      const key = uf === "—" ? "Não informado" : uf;
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const data = Array.from(counts.entries()).map(([name, value]) => ({
      name,
      value,
    }));
    return topN(data, 12);
  }, [members]);

  const reportTime = useMemo(() => {
    const buckets = ["Até 1 ano", "1 a 2 anos", "2 a 5 anos", "Mais de 5 anos", "Não informado"];
    const counts = new Map<string, number>(buckets.map((b) => [b, 0]));
    for (const m of members) {
      const b = bucketChurchTime((m as any)[COL_CHURCH_SINCE]);
      counts.set(b, (counts.get(b) ?? 0) + 1);
    }
    return buckets.map((name) => ({ name, value: counts.get(name) ?? 0 }));
  }, [members]);

  const reportBaptized = useMemo(() => {
    let yes = 0;
    let no = 0;
    let ni = 0;

    for (const m of members) {
      const v = (m as any)[COL_BAPTIZED];
      if (v === true) yes++;
      else if (v === false) no++;
      else ni++;
    }

    const data = [
      { name: "Batizados", value: yes },
      { name: "Não batizados", value: no },
      { name: "Não informado", value: ni },
    ].filter((x) => x.value > 0);

    return data;
  }, [members]);

  const chartTitle = useMemo(() => {
    if (activeReport === "city") return "Membros por Cidade";
    if (activeReport === "uf") return "Membros por UF";
    if (activeReport === "time") return "Tempo de Igreja";
    return "Relatório de Batizados";
  }, [activeReport]);

  const currentChartData = useMemo(() => {
    if (activeReport === "city") return reportCity;
    if (activeReport === "uf") return reportUF;
    if (activeReport === "time") return reportTime;
    return reportBaptized;
  }, [activeReport, reportCity, reportUF, reportTime, reportBaptized]);

  const listData = useMemo(() => {
    // lista filtrada baseada no gráfico (quando possível, mostra tudo ordenado)
    const rows = members.map((m) => {
      const name = ((m as any)[COL_NAME] as string) ?? "(Sem nome)";
      const cityRaw = (m as any)[COL_CITY] as string | null;
      const { city, uf } = parseCityAndUF(cityRaw);
      const since = (m as any)[COL_CHURCH_SINCE] as string | null;
      const baptized = (m as any)[COL_BAPTIZED] as boolean | null;

      return {
        id: m.id,
        name,
        city,
        uf,
        since,
        sinceBucket: bucketChurchTime(since),
        baptized: baptized === true ? "Sim" : baptized === false ? "Não" : "—",
      };
    });

    if (activeReport === "city") {
      return rows.sort((a, b) => a.city.localeCompare(b.city) || a.name.localeCompare(b.name));
    }
    if (activeReport === "uf") {
      return rows.sort((a, b) => a.uf.localeCompare(b.uf) || a.name.localeCompare(b.name));
    }
    if (activeReport === "time") {
      return rows.sort((a, b) => a.sinceBucket.localeCompare(b.sinceBucket) || a.name.localeCompare(b.name));
    }
    // baptized
    return rows.sort((a, b) => a.baptized.localeCompare(b.baptized) || a.name.localeCompare(b.name));
  }, [members, activeReport]);

  const colors = ["#111827", "#374151", "#6B7280", "#9CA3AF", "#D1D5DB", "#F3F4F6"];

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Carregando relatórios…
          </p>
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

  const isPie =
    activeReport === "uf" || activeReport === "baptized";
  // cidade: barras (muitas categorias)
  // tempo: barras (melhor comparação)

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
            onClick={() => {
              setActiveReport("city");
              setShowList(false);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "city" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <MapPin className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Por Cidade</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Top cidades (com “Outros”).
            </p>
          </button>

          <button
            onClick={() => {
              setActiveReport("uf");
              setShowList(false);
            }}
            className={`rounded-2xl bg-white shadow-md ring-1 p-5 text-left transition active:scale-[0.99]
              ${activeReport === "uf" ? "ring-neutral-900" : "ring-neutral-200 hover:shadow-lg"}`}
          >
            <div className="flex items-center gap-2">
              <Users className="h-5 w-5 text-neutral-800" />
              <p className="font-bold">Por UF</p>
            </div>
            <p className="mt-2 text-sm text-neutral-600">
              Interpreta “Curitiba/PR”.
            </p>
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
            <p className="mt-2 text-sm text-neutral-600">
              Faixas por tempo (anos).
            </p>
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
            <p className="mt-2 text-sm text-neutral-600">
              Pizza + lista de batizados.
            </p>
          </button>
        </div>

        {/* Chart */}
        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {isPie ? (
                <PieIcon className="h-5 w-5 text-neutral-800" />
              ) : (
                <BarChart3 className="h-5 w-5 text-neutral-800" />
              )}
              <h2 className="text-lg font-bold">{chartTitle}</h2>
            </div>

            <button
              onClick={() => setShowList((v) => !v)}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <List className="h-4 w-4" />
              {showList ? "Ocultar lista" : "Ver lista"}
            </button>
          </div>

          <div className="mt-6 h-[340px]">
            <ResponsiveContainer width="100%" height="100%">
              {isPie ? (
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
                      <Cell key={idx} fill={colors[idx % colors.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              ) : (
                <BarChart data={currentChartData}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} interval={0} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="value" />
                </BarChart>
              )}
            </ResponsiveContainer>
          </div>

          {/* List */}
          {showList ? (
            <div className="mt-6 rounded-2xl bg-white ring-1 ring-neutral-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-neutral-200 text-sm font-semibold text-neutral-800">
                Lista (ordenada) — {members.length} membros
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

          <p className="mt-4 text-xs text-neutral-500">
            Dica: se seus campos não forem exatamente <b>full_name, city, church_since, baptized</b>, ajuste no topo do arquivo.
          </p>
        </div>
      </div>
    </div>
  );
}
