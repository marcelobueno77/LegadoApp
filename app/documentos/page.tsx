"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import { FileText, ExternalLink, ArrowLeft } from "lucide-react";

type DocItem = {
  id: string;
  title: string;
  desc?: string;
  url: string; // caminho público (public/)
};

export default function DocumentosPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  // ✅ evita rodar 2x no Strict Mode (dev) e duplicar check
  const ranRef = useRef(false);

  // ✅ Liste aqui seus PDFs disponíveis
  const docs: DocItem[] = useMemo(
    () => [
      {
        id: "apostila-legado",
        title: "Apostila do Ministério Legado",
        desc: "Documento oficial do ministério (PDF).",
        url: "/docs/apostila-legado.pdf",
      },
      // { id:"estatuto", title:"Estatuto", desc:"...", url:"/docs/estatuto.pdf" },
    ],
    []
  );

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let alive = true;

    async function load() {
      setLoading(true);
      setMsg("");

      const { data, error } = await supabase.auth.getSession();
      const u = data.session?.user ?? null;

      if (error) {
        if (alive) {
          setMsg(error.message);
          setLoading(false);
        }
        return;
      }

      if (!u) {
        router.replace("/login");
        return;
      }

      if (!alive) return;

      setUser(u);
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
          <p className="text-sm font-medium text-neutral-700">
            Carregando documentos…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      {/* ✅ Topbar (igual padrão das outras telas) */}
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow-sm ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold">Documentos</h1>
            </div>
          </div>

          <div className="hidden sm:block text-right">
            <p className="text-xs text-neutral-500">Logado como</p>
            <p className="text-sm font-semibold text-neutral-900 truncate max-w-[260px]">
              {user?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Conteúdo */}
      <div className="mx-auto w-full max-w-5xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-6">
          <div className="grid grid-cols-1 gap-4">
            {docs.map((d) => (
              <div
                key={d.id}
                className="rounded-2xl bg-white shadow-sm ring-1 ring-neutral-200 p-5 flex items-start justify-between gap-4"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="h-5 w-5 text-neutral-700" />
                    <h3 className="text-lg font-bold text-neutral-900 truncate">
                      {d.title}
                    </h3>
                  </div>

                  {d.desc ? (
                    <p className="mt-2 text-sm text-neutral-600">{d.desc}</p>
                  ) : null}

                  <p className="mt-2 text-xs text-neutral-500 truncate">
                    {d.url}
                  </p>
                </div>

                <div className="flex flex-col gap-2 items-end shrink-0">
                  <a
                    href={d.url}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
                    title="Abrir PDF"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Ver
                  </a>
                </div>
              </div>
            ))}

            {!docs.length ? (
              <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-neutral-700">
                Nenhum documento disponível no momento.
              </div>
            ) : null}
          </div>
        </div>

        <p className="mt-4 text-xs text-neutral-500">
          Obs.: por enquanto os PDFs estão em /public/docs. Depois, se você
          quiser, a gente migra para Supabase Storage com controle por perfil.
        </p>

        {/* ✅ prefetch do dashboard (ajuda na volta rápida) */}
        <Link href="/dashboard" prefetch className="hidden" aria-hidden />
      </div>
    </div>
  );
}
