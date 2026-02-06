"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { ArrowLeft, Save, ShieldAlert, Search, XCircle } from "lucide-react";

type Role = "member" | "leader" | "admin";

type ProfileRow = {
  id: string;

  full_name: string | null;
  phone: string | null;
  address_street: string | null;
  city: string | null;
  cep: string | null;

  leader_name: string | null;
  pastor_name: string | null;
  vest_name: string | null;

  role: Role;
  created_at: string;
};

type EditableFields = Pick<
  ProfileRow,
  | "full_name"
  | "phone"
  | "address_street"
  | "city"
  | "cep"
  | "leader_name"
  | "pastor_name"
  | "vest_name"
  | "role"
>;

function safeTrim(v: string) {
  const t = (v ?? "").trim();
  return t.length ? t : "";
}

function toNullable(v: string) {
  const t = safeTrim(v);
  return t ? t : null;
}

function sameNullable(a: any, b: any) {
  // compara null/"" como equivalentes (pra UX ficar melhor)
  const aa = a === "" ? null : a;
  const bb = b === "" ? null : b;
  return aa === bb;
}

function normalizeCityUf(raw: string) {
  // mantém sua convenção: "Curitiba/PR"
  const v = safeTrim(raw);
  if (!v) return "";
  const parts = v.split("/");
  if (parts.length === 1) return safeTrim(parts[0]);
  const city = safeTrim(parts[0] ?? "");
  const uf = safeTrim(parts[1] ?? "").toUpperCase();
  return `${city}${uf ? "/" + uf : ""}`;
}

function normalizeCEP(raw: string) {
  // deixa só números e no máximo 8
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, 8);
  return digits;
}

function normalizePhone(raw: string) {
  // mantém só números (DDI/DD) e limita tamanho
  const digits = (raw ?? "").replace(/\D/g, "").slice(0, 13);
  return digits;
}

export default function MembrosAdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);

  const [rows, setRows] = useState<ProfileRow[]>([]);
  const [originalById, setOriginalById] = useState<Record<string, EditableFields>>(
    {}
  );

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

      // carrega lista (somente campos que o admin vai editar)
      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, phone, address_street, city, cep, leader_name, pastor_name, vest_name, role, created_at"
        )
        .order("created_at", { ascending: false })
        .limit(200);

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      const list = (data ?? []) as ProfileRow[];
      setRows(list);

      // snapshot original pra detectar alterações por linha
      const snapshot: Record<string, EditableFields> = {};
      for (const p of list) {
        snapshot[p.id] = {
          full_name: p.full_name ?? null,
          phone: p.phone ?? null,
          address_street: p.address_street ?? null,
          city: p.city ?? null,
          cep: p.cep ?? null,
          leader_name: p.leader_name ?? null,
          pastor_name: p.pastor_name ?? null,
          vest_name: p.vest_name ?? null,
          role: p.role,
        };
      }
      setOriginalById(snapshot);

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
        r.phone ?? "",
        r.address_street ?? "",
        r.city ?? "",
        r.cep ?? "",
        r.leader_name ?? "",
        r.pastor_name ?? "",
        r.vest_name ?? "",
        r.role ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return hay.includes(term);
    });
  }, [q, rows]);

  function setLocalField(id: string, patch: Partial<EditableFields>) {
    setRows((prev) => prev.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  }

  function isDirty(p: ProfileRow) {
    const o = originalById[p.id];
    if (!o) return false;

    return !(
      sameNullable(p.full_name, o.full_name) &&
      sameNullable(p.phone, o.phone) &&
      sameNullable(p.address_street, o.address_street) &&
      sameNullable(p.city, o.city) &&
      sameNullable(p.cep, o.cep) &&
      sameNullable(p.leader_name, o.leader_name) &&
      sameNullable(p.pastor_name, o.pastor_name) &&
      sameNullable(p.vest_name, o.vest_name) &&
      p.role === o.role
    );
  }

  function resetRow(id: string) {
    const o = originalById[id];
    if (!o) return;

    setRows((prev) =>
      prev.map((p) =>
        p.id === id
          ? {
              ...p,
              full_name: o.full_name,
              phone: o.phone,
              address_street: o.address_street,
              city: o.city,
              cep: o.cep,
              leader_name: o.leader_name,
              pastor_name: o.pastor_name,
              vest_name: o.vest_name,
              role: o.role,
            }
          : p
      )
    );
  }

  async function saveRow(p: ProfileRow) {
    setMsg("");
    setSavingId(p.id);

    const payload: EditableFields = {
      full_name: toNullable(safeTrim(p.full_name ?? "")),
      phone: toNullable(normalizePhone(p.phone ?? "")),
      address_street: toNullable(safeTrim(p.address_street ?? "")),
      city: toNullable(normalizeCityUf(p.city ?? "")),
      cep: toNullable(normalizeCEP(p.cep ?? "")),
      leader_name: toNullable(safeTrim(p.leader_name ?? "")),
      pastor_name: toNullable(safeTrim(p.pastor_name ?? "")),
      vest_name: toNullable(safeTrim(p.vest_name ?? "")),
      role: p.role,
    };

    const { error } = await supabase.from("profiles").update(payload).eq("id", p.id);

    if (error) {
      setMsg(error.message);
      setSavingId(null);
      return;
    }

    // atualiza snapshot original
    setOriginalById((prev) => ({
      ...prev,
      [p.id]: payload,
    }));

    // atualiza linha atual já normalizada
    setRows((prev) => prev.map((x) => (x.id === p.id ? { ...x, ...payload } : x)));

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
                onClick={() => router.replace("/dashboard")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <ArrowLeft className="h-4 w-4" />
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
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Admin: Gerenciar perfis</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Editar: nome, telefone, endereço, cidade, CEP, líder, pastor, colete e perfil.
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">{user?.email}</div>

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

        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="relative w-full sm:max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-500" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar por nome, telefone, cidade, CEP, líder, pastor, colete, role ou UUID…"
                className="w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 pl-9 pr-3 py-3 text-sm outline-none placeholder:text-neutral-400 focus:ring-2 focus:ring-blue-400 transition"
              />
            </div>

            <div className="text-xs text-neutral-500">
              Mostrando <span className="font-semibold">{filtered.length}</span> de{" "}
              <span className="font-semibold">{rows.length}</span>
            </div>
          </div>

          <div className="mt-6 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-neutral-500">
                  <th className="py-3 pr-4">Nome</th>
                  <th className="py-3 pr-4">Telefone</th>
                  <th className="py-3 pr-4">Endereço</th>
                  <th className="py-3 pr-4">Cidade/UF</th>
                  <th className="py-3 pr-4">CEP</th>
                  <th className="py-3 pr-4">Líder</th>
                  <th className="py-3 pr-4">Pastor</th>
                  <th className="py-3 pr-4">Colete</th>
                  <th className="py-3 pr-4">Perfil</th>
                  <th className="py-3 pr-0 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {filtered.map((p) => {
                  const dirty = isDirty(p);

                  return (
                    <tr key={p.id} className="border-t border-neutral-200 align-top">
                      <td className="py-4 pr-4 min-w-[260px]">
                        <div className="text-xs text-neutral-500 truncate max-w-[420px]">
                          UUID: {p.id}
                        </div>
                        <input
                          value={p.full_name ?? ""}
                          onChange={(e) => setLocalField(p.id, { full_name: e.target.value })}
                          placeholder="Nome completo"
                          className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                        {dirty ? (
                          <div className="mt-2 text-xs font-semibold text-amber-600">
                            Alterações pendentes
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-neutral-400">Sem alterações</div>
                        )}
                      </td>

                      <td className="py-4 pr-4 min-w-[160px]">
                        <input
                          value={p.phone ?? ""}
                          onChange={(e) => setLocalField(p.id, { phone: e.target.value })}
                          placeholder="(DD) 99999-9999"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                        <div className="mt-1 text-[11px] text-neutral-400">Salva apenas números</div>
                      </td>

                      <td className="py-4 pr-4 min-w-[220px]">
                        <input
                          value={p.address_street ?? ""}
                          onChange={(e) =>
                            setLocalField(p.id, { address_street: e.target.value })
                          }
                          placeholder="Rua / Nº / Bairro"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                      </td>

                      <td className="py-4 pr-4 min-w-[180px]">
                        <input
                          value={p.city ?? ""}
                          onChange={(e) => setLocalField(p.id, { city: e.target.value })}
                          placeholder="Curitiba/PR"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                        <div className="mt-1 text-[11px] text-neutral-400">Formato: Cidade/UF</div>
                      </td>

                      <td className="py-4 pr-4 min-w-[120px]">
                        <input
                          value={p.cep ?? ""}
                          onChange={(e) => setLocalField(p.id, { cep: e.target.value })}
                          placeholder="80000000"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                        <div className="mt-1 text-[11px] text-neutral-400">Salva 8 dígitos</div>
                      </td>

                      <td className="py-4 pr-4 min-w-[180px]">
                        <input
                          value={p.leader_name ?? ""}
                          onChange={(e) =>
                            setLocalField(p.id, { leader_name: e.target.value })
                          }
                          placeholder="Nome do líder"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                      </td>

                      <td className="py-4 pr-4 min-w-[180px]">
                        <input
                          value={p.pastor_name ?? ""}
                          onChange={(e) =>
                            setLocalField(p.id, { pastor_name: e.target.value })
                          }
                          placeholder="Nome do pastor"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                      </td>

                      <td className="py-4 pr-4 min-w-[180px]">
                        <input
                          value={p.vest_name ?? ""}
                          onChange={(e) => setLocalField(p.id, { vest_name: e.target.value })}
                          placeholder="Nome do colete"
                          className="w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        />
                      </td>

                      <td className="py-4 pr-4">
                        <select
                          value={p.role}
                          onChange={(e) =>
                            setLocalField(p.id, { role: e.target.value as Role })
                          }
                          className="rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                        >
                          <option value="member">member</option>
                          <option value="leader">leader</option>
                          <option value="admin">admin</option>
                        </select>
                      </td>

                      <td className="py-4 pr-0 text-right min-w-[220px]">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => resetRow(p.id)}
                            disabled={!dirty || savingId === p.id}
                            className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-50"
                            title="Desfazer alterações desta linha"
                          >
                            <XCircle className="h-4 w-4" />
                            Desfazer
                          </button>

                          <button
                            onClick={() => saveRow(p)}
                            disabled={savingId === p.id || !dirty}
                            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
                          >
                            <Save className="h-4 w-4" />
                            {savingId === p.id ? "Salvando..." : "Salvar"}
                          </button>
                        </div>
                        <div className="mt-2 text-[11px] text-neutral-400">
                          Atualiza apenas os campos permitidos
                        </div>
                      </td>
                    </tr>
                  );
                })}

                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-8 text-center text-neutral-500">
                      Nenhum perfil encontrado.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          <p className="mt-5 text-xs text-neutral-500">
            Essa tela edita diretamente a tabela <b>public.profiles</b> (somente ADMIN).
          </p>
        </div>
      </div>
    </div>
  );
}
