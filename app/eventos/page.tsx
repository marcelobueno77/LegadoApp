"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  CalendarDays,
  MapPin,
  Plus,
  Pencil,
  ExternalLink,
  Download,
} from "lucide-react";

type Role = "member" | "leader" | "admin";

type EventRow = {
  id: string;
  title: string;
  description: string | null;
  location: string | null;
  start_at: string;
  end_at: string | null;
};

type RangeFilter = "today" | "week" | "month" | "all";

function fmtDateTime(iso: string) {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function endOfToday() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function endOfWeekFromNow() {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d;
}

function endOfMonthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// Formato ICS: YYYYMMDDTHHMMSSZ (em UTC)
function toICSDate(iso: string) {
  const d = new Date(iso);
  const yyyy = d.getUTCFullYear();
  const mm = pad2(d.getUTCMonth() + 1);
  const dd = pad2(d.getUTCDate());
  const hh = pad2(d.getUTCHours());
  const mi = pad2(d.getUTCMinutes());
  const ss = pad2(d.getUTCSeconds());
  return `${yyyy}${mm}${dd}T${hh}${mi}${ss}Z`;
}

function escapeICS(text: string) {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\n/g, "\\n")
    .replace(/,/g, "\\,")
    .replace(/;/g, "\\;");
}

function buildICS(e: EventRow) {
  const dtStart = toICSDate(e.start_at);
 

  const dtEnd = e.end_at ? toICSDate(e.end_at) : toICSDate(e.start_at);

  const uid = `${e.id}@legadoapp`;

  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//LegadoApp//Eventos//PT-BR",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${toICSDate(new Date().toISOString())}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICS(e.title)}`,
    e.description ? `DESCRIPTION:${escapeICS(e.description)}` : "",
    e.location ? `LOCATION:${escapeICS(e.location)}` : "",
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean);

  return lines.join("\r\n");
}

function downloadICS(e: EventRow) {
  const content = buildICS(e);
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = `evento-${e.id}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();

  URL.revokeObjectURL(url);
}

function buildGoogleCalendarUrl(e: EventRow) {
  // https://calendar.google.com/calendar/render?action=TEMPLATE&text=...&dates=.../...&details=...&location=...
  const start = toICSDate(e.start_at);
  const end = e.end_at ? toICSDate(e.end_at) : toICSDate(e.start_at);

  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: e.title,
    dates: `${start}/${end}`,
  });

  if (e.description) params.set("details", e.description);
  if (e.location) params.set("location", e.location);

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

export default function EventosPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [events, setEvents] = useState<EventRow[]>([]);
  const [q, setQ] = useState("");
  const [range, setRange] = useState<RangeFilter>("week");

  const canManage = useMemo(() => role === "leader" || role === "admin", [role]);

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();

    const now = new Date();
    const min = range === "today" ? startOfToday() : now;
    let max: Date | null = null;

    if (range === "today") max = endOfToday();
    if (range === "week") max = endOfWeekFromNow();
    if (range === "month") max = endOfMonthFromNow();
    if (range === "all") {
      max = null;
    }

    return events.filter((e) => {
      const d = new Date(e.start_at);

      const inMin = d >= min;
      const inMax = max ? d <= max : true;
      if (!inMin || !inMax) return false;

      if (!s) return true;
      return (
        e.title.toLowerCase().includes(s) ||
        (e.location ?? "").toLowerCase().includes(s) ||
        (e.description ?? "").toLowerCase().includes(s)
      );
    });
  }, [q, events, range]);

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
      const { data: prof, error: profErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      if (profErr) setMsg(profErr.message);
      setRole((prof?.role ?? "member") as Role);

      // carregar eventos (do "agora" pra frente)
      const nowIso = new Date().toISOString();
      const { data, error } = await supabase
        .from("events")
        .select("id, title, description, location, start_at, end_at")
        .gte("start_at", nowIso)
        .order("start_at", { ascending: true });

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setEvents([]);
      } else {
        setEvents((data ?? []) as EventRow[]);
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

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando eventos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Eventos</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Agenda pública do ministério (apenas visualização para membros).
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

            {canManage ? (
              <button
                onClick={() => router.push("/eventos/novo")}
                className="mt-3 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
              >
                <Plus className="h-4 w-4" />
                Novo evento
              </button>
            ) : null}

            <button
              onClick={() => router.push("/dashboard")}
              className="mt-3 ml-2 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
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
            <div className="flex gap-2 flex-wrap">
              {(["today", "week", "month", "all"] as RangeFilter[]).map((r) => {
                const label =
                  r === "today"
                    ? "Hoje"
                    : r === "week"
                    ? "Semana"
                    : r === "month"
                    ? "Mês"
                    : "Todos";
                const active = range === r;

                return (
                  <button
                    key={r}
                    onClick={() => setRange(r)}
                    className={`rounded-xl px-4 py-2 text-sm font-semibold shadow ring-1 transition active:scale-[0.99]
                      ${
                        active
                          ? "bg-neutral-900 text-white ring-neutral-900"
                          : "bg-white text-neutral-900 ring-neutral-200 hover:bg-neutral-50"
                      }`}
                  >
                    {label}
                  </button>
                );
              })}
            </div>

            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por título, local ou descrição…"
              className="w-full sm:w-[420px] rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400"
            />
          </div>

          <div className="mt-6 grid grid-cols-1 gap-4">
            {filtered.map((e) => (
              <div
                key={e.id}
                className="rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 p-5"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <CalendarDays className="h-5 w-5 text-neutral-700" />
                      <h3 className="text-lg font-bold text-neutral-900 truncate">
                        {e.title}
                      </h3>
                    </div>

                    <p className="mt-2 text-sm text-neutral-700">
                      <span className="font-semibold">Quando:</span>{" "}
                      {fmtDateTime(e.start_at)}
                      {e.end_at ? ` até ${fmtDateTime(e.end_at)}` : ""}
                    </p>

                    {e.location ? (
                      <p className="mt-1 text-sm text-neutral-700 flex items-center gap-2">
                        <MapPin className="h-4 w-4 text-neutral-600" />
                        <span className="truncate">{e.location}</span>
                      </p>
                    ) : null}

                    {e.description ? (
                      <p className="mt-3 text-sm text-neutral-600">{e.description}</p>
                    ) : null}
                  </div>

                  <div className="flex flex-col gap-2 items-end">
                    {/* Google Calendar */}
                    <a
                      href={buildGoogleCalendarUrl(e)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
                      title="Adicionar ao Google Calendar"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Google
                    </a>

                    {/* Download ICS */}
                    <button
                      onClick={() => downloadICS(e)}
                      className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
                      title="Baixar arquivo .ics"
                    >
                      <Download className="h-4 w-4" />
                      .ics
                    </button>

                    {/* Editar */}
                    {canManage ? (
                      <button
                        onClick={() => router.push(`/eventos/editar/${e.id}`)}
                        className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
                      >
                        <Pencil className="h-4 w-4" />
                        Editar
                      </button>
                    ) : null}
                  </div>
                </div>
              </div>
            ))}

            {!filtered.length ? (
              <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-neutral-700">
                Nenhum evento encontrado para esse filtro.
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Próximo passo opcional: sincronizar com Google Calendar via API (mais pra frente).
        </p>
      </div>
    </div>
  );
}
