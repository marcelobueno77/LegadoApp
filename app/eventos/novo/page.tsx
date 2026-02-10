"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft } from "lucide-react";

type Role = "member" | "leader" | "director" | "admin";

export default function NovoEventoPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>("member");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  // ✅ evita boot duplicado no Strict Mode (dev)
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let alive = true;

    async function boot() {
      setLoading(true);
      setMsg("");

      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      const u = sess?.session?.user ?? null;

      if (sessErr) {
        if (alive) {
          setMsg(sessErr.message);
          setLoading(false);
        }
        return;
      }

      if (!u) {
        router.replace("/login");
        return;
      }

      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      if (!alive) return;

      if (profErr) {
        setMsg(profErr.message);
        setLoading(false);
        return;
      }

      const r = (prof?.role ?? "member") as Role;
      setRole(r);

      const canCreate = r === "leader" || r === "director" || r === "admin";
      if (!canCreate) {
        router.replace("/eventos");
        return;
      }

      setLoading(false);
    }

    boot();

    return () => {
      alive = false;
    };
  }, [router]);

  async function save() {
    if (saving) return;

    setMsg("");

    if (!title.trim() || !startAt) {
      setMsg("Preencha pelo menos Título e Data/Hora de início.");
      return;
    }

    setSaving(true);

    try {
      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      const u = sess?.session?.user ?? null;

      if (sessErr) {
        setMsg(sessErr.message);
        return;
      }

      if (!u) {
        router.replace("/login");
        return;
      }

      const payload = {
        title: title.trim(),
        description: description.trim() || null,
        location: location.trim() || null,
        start_at: new Date(startAt).toISOString(),
        end_at: endAt ? new Date(endAt).toISOString() : null,
        created_by: u.id,
      };

      const { error } = await supabase.from("events").insert(payload);

      if (error) {
        setMsg(error.message);
        return;
      }

      router.push("/eventos");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao criar evento.");
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

  const canCreate = role === "leader" || role === "director" || role === "admin";
  if (!canCreate) return null;

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* ✅ Topbar padrão */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-2xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/eventos")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold">Novo evento</h1>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-2xl px-6 py-6">
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-6">
          <p className="text-sm text-neutral-600">
            Cadastro de evento (somente líder/diretor/admin).
          </p>

          {msg ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              {msg}
            </div>
          ) : null}

          <div className="mt-6 grid gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Título
              </label>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Ex: Reunião Ministério Legado"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Descrição
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="mt-2 w-full min-h-[110px] rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Detalhes do evento…"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Local
              </label>
              <input
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                placeholder="Ex: Online / Parque Barigui / Igreja…"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-semibold text-neutral-700">
                  Início
                </label>
                <input
                  type="datetime-local"
                  value={startAt}
                  onChange={(e) => setStartAt(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-neutral-700">
                  Fim (opcional)
                </label>
                <input
                  type="datetime-local"
                  value={endAt}
                  onChange={(e) => setEndAt(e.target.value)}
                  className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
                />
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            <button
              onClick={() => router.push("/eventos")}
              disabled={saving}
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-60"
            >
              Cancelar
            </button>

            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Criar evento"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
