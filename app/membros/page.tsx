"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase/client";

type Role = "member" | "leader" | "director" | "admin";

type Profile = {
  id: string;
  full_name: string | null;
  birth_date: string | null;
  phone: string | null;
  address_street: string | null;
  city: string | null;
  cep: string | null;
  leader_name: string | null;
  pastor_name: string | null;
  member_since: string | null;
  baptized: boolean | null;
  vest_name: string | null;
  role: Role;
};

function toDateInput(v: string | null) {
  return v ? v.slice(0, 10) : "";
}

function Field({
  label,
  children,
  span2,
}: {
  label: string;
  children: React.ReactNode;
  span2?: boolean;
}) {
  return (
    <div className={span2 ? "sm:col-span-2" : ""}>
      <label className="text-xs font-semibold text-neutral-700">{label}</label>
      <div className="mt-2">{children}</div>
    </div>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  const isDate = props.type === "date";

  const base =
    "w-full rounded-xl bg-white shadow-md px-3 py-3 text-sm outline-none placeholder:text-neutral-400 transition " +
    "focus:ring-2 focus:ring-blue-400 text-neutral-900 min-h-[46px]";

  const dateFix = isDate
    ? "border border-neutral-200 ring-0 focus:border-blue-400 appearance-none [-webkit-appearance:none] [color-scheme:light]"
    : "ring-1 ring-neutral-200";

  const mergedClassName = [base, dateFix, props.className]
    .filter(Boolean)
    .join(" ");

  return <input {...props} className={mergedClassName} />;
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
    />
  );
}

export default function MembrosPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const mode = searchParams.get("mode");
  const editId = searchParams.get("id");

  const isEditMode = mode === "edit" && !!editId;

  const [user, setUser] = useState<User | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let alive = true;

    async function load() {
      setLoading(true);
      setMsg("");

      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      const u = sess.session?.user ?? null;

      if (sessErr) {
        if (alive) setMsg(sessErr.message);
        if (alive) setLoading(false);
        return;
      }

      if (!u) {
        router.replace("/login");
        return;
      }

      if (!alive) return;
      setUser(u);

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("id", u.id)
        .single();

      if (!alive) return;

      if (meErr) {
        setMsg(meErr.message);
        setLoading(false);
        return;
      }

      const currentRole = (me?.role ?? "member") as Role;
      setMyRole(currentRole);

      const targetId = isEditMode ? editId : u.id;

      if (isEditMode && currentRole !== "admin") {
        setMsg("Apenas administradores podem editar o cadastro de outro membro.");
        setLoading(false);
        return;
      }

      if (!targetId) {
        setMsg("ID do perfil não informado.");
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select(
          "id, full_name, birth_date, phone, address_street, city, cep, leader_name, pastor_name, member_since, baptized, vest_name, role"
        )
        .eq("id", targetId)
        .maybeSingle();

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      const safe = (data ??
        ({
          id: targetId,
          full_name: null,
          birth_date: null,
          phone: null,
          address_street: null,
          city: null,
          cep: null,
          leader_name: null,
          pastor_name: null,
          member_since: null,
          baptized: null,
          vest_name: null,
          role: "member",
        } as Profile)) as Profile;

      setProfile({
        ...safe,
        birth_date: toDateInput(safe.birth_date),
        member_since: toDateInput(safe.member_since),
      });

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
  }, [router, isEditMode, editId]);

  async function save() {
    if (!user || !profile || saving) return;

    if (isEditMode && myRole !== "admin") {
      setMsg("Apenas administradores podem editar outro perfil.");
      return;
    }

    setSaving(true);
    setMsg("");

    const targetId = isEditMode ? profile.id : user.id;

    const payload = {
      full_name: profile.full_name?.trim() || null,
      birth_date: profile.birth_date || null,
      phone: profile.phone?.trim() || null,
      address_street: profile.address_street?.trim() || null,
      city: profile.city?.trim() || null,
      cep: profile.cep?.trim() || null,
      leader_name: profile.leader_name?.trim() || null,
      pastor_name: profile.pastor_name?.trim() || null,
      member_since: profile.member_since || null,
      baptized: profile.baptized,
      vest_name: profile.vest_name?.trim() || null,
    };

    try {
      let error = null;

      if (isEditMode) {
        // ✅ edição de outro membro = UPDATE
        const res = await supabase
          .from("profiles")
          .update(payload)
          .eq("id", targetId);

        error = res.error;
      } else {
        // ✅ edição do próprio cadastro
        const res = await supabase
          .from("profiles")
          .upsert(
            {
              id: targetId,
              ...payload,
            },
            { onConflict: "id" }
          );

        error = res.error;
      }

      if (error) {
        setMsg(error.message);
        return;
      }

      setProfile((prev) =>
        prev
          ? {
              ...prev,
              ...payload,
              id: targetId,
              birth_date: toDateInput(payload.birth_date),
              member_since: toDateInput(payload.member_since),
            }
          : prev
      );

      setMsg(
        isEditMode
          ? "✅ Cadastro do membro atualizado com sucesso!"
          : "✅ Dados atualizados com sucesso!"
      );

      setTimeout(() => {
        if (isEditMode) {
          router.push("/membros/admin");
        } else {
          router.back();
        }
      }, 700);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando…</p>
        </div>
      </div>
    );
  }

  if (isEditMode && myRole !== "admin") {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4 max-w-lg w-full">
          <p className="text-sm font-medium text-neutral-700">
            Acesso negado para editar este cadastro.
          </p>
          {msg ? <p className="mt-2 text-sm text-neutral-600">{msg}</p> : null}

          <button
            onClick={() => router.replace("/dashboard")}
            className="mt-4 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Não foi possível carregar o cadastro.
          </p>
          {msg ? <p className="mt-2 text-sm text-neutral-600">{msg}</p> : null}
        </div>
      </div>
    );
  }

  const isAdmin = myRole === "admin";

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-start justify-between gap-4">
          <div>
            <p className="text-sm text-neutral-500">LegadoApp</p>
            <h1 className="text-lg font-bold">
              {isEditMode ? "Editar Cadastro de Membro" : "Cadastro de Membros"}
            </h1>
            {isEditMode ? (
              <p className="mt-1 text-xs text-neutral-500">
                Editando o cadastro de outro membro
              </p>
            ) : null}
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">
              {user?.email}
            </div>

            <div className="mt-1 inline-flex items-center rounded-full bg-neutral-100 px-3 py-1 text-xs font-semibold text-neutral-700 ring-1 ring-neutral-200">
              Perfil: {myRole ?? profile.role}
            </div>

            {isAdmin ? (
              <button
                type="button"
                onClick={() => router.push("/membros/admin")}
                className="mt-3 w-full rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
              >
                Admin: Gerenciar perfis
              </button>
            ) : null}
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-3xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nome">
              <Input
                value={profile.full_name ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, full_name: e.target.value })
                }
                placeholder="Seu nome completo"
              />
            </Field>

            <Field label="Nome no Colete">
              <Input
                value={profile.vest_name ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, vest_name: e.target.value })
                }
                placeholder="Ex: MARCELO BUENO"
              />
            </Field>

            <Field label="Data de Nascimento">
              <Input
                type="date"
                value={profile.birth_date ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, birth_date: e.target.value })
                }
              />
            </Field>

            <Field label="Telefone">
              <Input
                value={profile.phone ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, phone: e.target.value })
                }
                placeholder="(41) 99999-9999"
              />
            </Field>

            <Field label="Endereço (nome e rua)" span2>
              <Input
                value={profile.address_street ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, address_street: e.target.value })
                }
                placeholder="Rua / Av / número / bairro"
              />
            </Field>

            <Field label="Cidade/UF">
              <Input
                value={profile.city ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, city: e.target.value })
                }
                placeholder="Curitiba/PR"
              />
            </Field>

            <Field label="CEP">
              <Input
                value={profile.cep ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, cep: e.target.value })
                }
                placeholder="00000-000"
              />
            </Field>

            <Field label="Nome do Líder">
              <Input
                value={profile.leader_name ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, leader_name: e.target.value })
                }
                placeholder="Nome do líder"
              />
            </Field>

            <Field label="Nome do Pastor">
              <Input
                value={profile.pastor_name ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, pastor_name: e.target.value })
                }
                placeholder="Nome do pastor"
              />
            </Field>

            <Field label="É membro da Bola de Neve desde?">
              <Input
                type="date"
                value={profile.member_since ?? ""}
                onChange={(e) =>
                  setProfile({ ...profile, member_since: e.target.value })
                }
              />
            </Field>

            <Field label="É batizado?">
              <Select
                value={
                  profile.baptized === null
                    ? ""
                    : profile.baptized
                    ? "yes"
                    : "no"
                }
                onChange={(e) => {
                  const v = e.target.value;
                  setProfile({
                    ...profile,
                    baptized: v === "" ? null : v === "yes",
                  });
                }}
              >
                <option value="">Selecione</option>
                <option value="yes">Sim</option>
                <option value="no">Não</option>
              </Select>
            </Field>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() =>
                isEditMode
                  ? router.push("/membros/admin")
                  : router.replace("/dashboard")
              }
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Voltar
            </button>

            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-600 active:scale-[0.99] transition disabled:opacity-60"
            >
              {saving
                ? "Salvando..."
                : isEditMode
                ? "Atualizar cadastro"
                : "Salvar cadastro"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}