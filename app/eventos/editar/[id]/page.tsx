"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type Role = "member" | "leader" | "admin";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
};

function toLocalInput(iso: string) {
  // converte ISO -> yyyy-MM-ddThh:mm (para datetime-local)
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

export default function EditarEventoPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");

  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role>("member");
  const [msg, setMsg] = useState("");
  const [saving, setSaving] = useState(false);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [startAt, setStartAt] = useState("");
  const [endAt, setEndAt] = useState("");

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);
      setMsg("");

      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user;

      if (!u) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      const r = (prof?.role ?? "member") as Role;
      if (!alive) return;

      setRole(r);

      if (!(r === "leader" || r === "admin")) {
        router.replace("/eventos");
        return;
      }

      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, location, start_at, end_at")
        .eq("id", id)
        .single();

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setLoading(false);
        return;
      }

      const e = data as EventRow;
      setTitle(e.title);
      setDescription(e.description ?? "");
      setLocation(e.location ?? "");
      setStartAt(toLocalInput(e.start_at));
      setEndAt(e.end_at ? toLocalInput(e.end_at) : "");

      setLoading(false);
    }

    boot();
    return () => {
      alive = false;
    };
  }, [router, id]);

  async function save() {
    setMsg("");

    if (!title.trim() || !startAt) {
      setMsg("Preencha pelo menos Título e Início.");
      return;
    }

    setSaving(true);

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      location: location.trim() || null,
      start_at: new Date(startAt).toISOString(),
      end_at: endAt ? new Date(endAt).toISOString() : null,
    };

    const { error } = await supabase.from("events").update(payload).eq("id", id);

    if (error) {
      setMsg(error.message);
      setSaving(false);
      return;
    }

    setMsg("✅ Evento atualizado com sucesso!");
    setSaving(false);

    setTimeout(() => router.push("/eventos"), 700);
  }

  async function remove() {
    const ok = confirm("Tem certeza que deseja excluir este evento?");
    if (!ok) return;

    const { error } = await supabase.from("events").delete().eq("id", id);
    if (error) {
      setMsg(error.message);
      return;
    }

    router.push("/eventos");
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

  if (!(role === "leader" || role === "admin")) return null;

  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
        <h1 className="text-2xl font-bold">Editar evento</h1>
        <p className="mt-1 text-sm text-neutral-600">Atualize os dados do evento.</p>

        {msg ? (
          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="mt-6 grid gap-4">
          <div>
            <label className="text-xs font-semibold text-neutral-700">Título</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="mt-2 w-full min-h-[110px] rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div>
            <label className="text-xs font-semibold text-neutral-700">Local</label>
            <input
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700">Início</label>
              <input
                type="datetime-local"
                value={startAt}
                onChange={(e) => setStartAt(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700">Fim (opcional)</label>
              <input
                type="datetime-local"
                value={endAt}
                onChange={(e) => setEndAt(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
              />
            </div>
          </div>
        </div>

        <div className="mt-6 flex items-center justify-between gap-3">
          <button
            onClick={remove}
            className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-red-700 shadow ring-1 ring-red-200 hover:bg-red-50 active:scale-[0.99] transition"
          >
            Excluir
          </button>

          <div className="flex gap-3">
            <button
              onClick={() => router.push("/eventos")}
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Cancelar
            </button>

            <button
              onClick={save}
              disabled={saving}
              className="rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
