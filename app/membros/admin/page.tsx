"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Save, ShieldAlert, Search } from "lucide-react";

type Role = "member" | "leader" | "admin";

type ProfileRow = {
  id: string;
  full_name: string | null;
  vest_name: string | null;
  city: string | null;
  leader_name: string | null;
  pastor_name: string | null;
  role: Role;
  created_at: string;
};

export default function MembrosAdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);
      setMsg("");

      // sessão
      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user ?? null;

      if (!u) {
        router.replace("/login");
        return;
      }
      if (!alive) return;
      setUser(u);

      // meu role (pra validar admin)
      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      if (!alive) return;

      if (meErr) {
        setMsg(meErr.message);
        setLoading(false);
        return;
      }

      const role = (me?.role ?? "member") as Role;
      setMyRole(role);

      if (role !== "admin") {
        setLoading(false);
        return; // vai renderizar "acesso negado"
      }

      // carrega lista
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, vest_name, city, leader_name, pastor_name, role, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      setRows((data ?? []) as ProfileRow[]);
      setLoading(false);
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return rows;

    return rows.filter((r) => {
      const hay = [
        r.id,
        r.full_name ?? "",
        r.vest_name ?? "",
        r.city ?? "",
        r.leader_name ?? "",
        r.pastor_name ?? "",
        r.role ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [q, rows]);

  function setRoleLocal(id: string, role: Role) {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, role } : p)));
  }

  async function saveRole(id: string, role: Role) {
    setMsg("");
    setSavingId(id);

    const { error } = await supabase.from("profiles").update({ role }).eq("id", id);

    if (error) {
      setMsg(error.message);
      setSavingId(null);
      return;
    }

    setMsg("✅ Perfil atualizado com sucesso!");
    setSavingId(null);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando admin…</p>
        </div>
      </div>
    );
  }

  // não-admin
  if (myRole !== "admin") {
    return (
      <div className="min-h-screen bg-white text-neutral-900 p-6">
        <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Acesso restrito</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Somente administradores podem gerenciar perfis.
              </p>
              {msg ? (
                <p className="mt-3 text-sm text-neutral-700">
                  <span className="font-semibold">Detalhe:</span> {msg}
                </p>
              ) : null}
              <button
                type="button"
                onClick={() => router.replace("/membros")}
                className="..."
              >
                Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // admin
  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin: Gerenciar perfis</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Pesquise perfis e altere o tipo de acesso (member / leader / admin).
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">
              {user?.email}
            </div>

            <button
              onClick={() => router.push("/membros")}
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

        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, cidade, colete, role ou UUID…"
                className="w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 pl-9 pr-3 py-3 text-sm outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-400 transition"
              />
            </div>

            <div className="text-xs text-neutral-500">
              Mostrando <span className="font-semibold">{filtered.length}</span>{" "}
              de <span className="font-semibold">{rows.length}</span>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-3 pr-4">Nome</th>
                  <th className="py-3 pr-4">Cidade</th>
                  <th className="py-3 pr-4">Líder</th>
                  <th className="py-3 pr-4">Perfil</th>
                  <th className="py-3 pr-0 text-right">Ação</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-neutral-200">
                    <td className="py-4 pr-4">
                      <div className="font-semibold text-neutral-900">
                        {p.full_name || "(Sem nome)"}
                      </div>
                      <div className="text-xs text-neutral-500 truncate max-w-[380px]">
                        UUID: {p.id} {p.vest_name ? ` • Colete: ${p.vest_name}` : ""}
                      </div>
                    </td>

                    <td className="py-4 pr-4">{p.city || "-"}</td>
                    <td className="py-4 pr-4">{p.leader_name || "-"}</td>

                    <td className="py-4 pr-4">
                      <select
                        value={p.role}
                        onChange={(e) => setRoleLocal(p.id, e.target.value as Role)}
                        className="rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                      >
                        <option value="member">member</option>
                        <option value="leader">leader</option>
                        <option value="admin">admin</option>
                      </select>
                    </td>

                    <td className="py-4 pr-0 text-right">
                      <button
                        onClick={() => saveRole(p.id, p.role)}
                        disabled={savingId === p.id}
                        className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
                      >
                        <Save className="h-4 w-4" />
                        {savingId === p.id ? "Salvando..." : "Salvar"}
                      </button>
                    </td>
                  </tr>
                ))}

                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-neutral-500">
                      Nenhum perfil encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-xs text-neutral-500">
            Dica: por enquanto essa tela lista perfis pelo banco <b>public.profiles</b>.
            Se depois você quiser buscar por e-mail direto aqui, a gente adiciona a coluna
            <b> email</b> no profiles + trigger pra preencher automaticamente.
          </p>
        </div>
      </div>
    </div>
  );
}
