"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import Image from "next/image";
import Link from "next/link";
import { ArrowLeft, ExternalLink, RefreshCw, Files } from "lucide-react";

const DRIVE_FOLDER_ID = "1-NQl3tr_poM_-Ba8Ne0yU1tH1_vOnj5s";

export default function TemplatesPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const ranRef = useRef(false);

  // 🔗 embedded view do Google Drive (mostra lista de arquivos)
  const embedUrl = `https://drive.google.com/embeddedfolderview?id=${DRIVE_FOLDER_ID}#grid`;
  const openUrl = `https://drive.google.com/drive/folders/${DRIVE_FOLDER_ID}`;

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let mounted = true;

    async function load() {
      setMsg("");
      setLoading(true);

      const { data, error: sessErr } = await supabase.auth.getSession();
      const sessionUser = data.session?.user ?? null;

      if (!mounted) return;

      if (sessErr) {
        setMsg(sessErr.message);
        setLoading(false);
        return;
      }

      setUser(sessionUser);

      if (!sessionUser) {
        setLoading(false);
        router.replace("/login");
        return;
      }

      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (!sessionUser) {
        router.replace("/login");
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Carregando Templates…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-2xl bg-white ring-1 ring-neutral-200 shadow flex items-center justify-center overflow-hidden">
              <Image
                src="/legado.png"
                alt="Legado Ministério"
                width={40}
                height={40}
                className="object-contain"
                priority
              />
            </div>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold flex items-center gap-2">
                <Files className="h-5 w-5" />
                Templates
              </h1>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </Link>

            <a
              href={openUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
            >
              <ExternalLink className="h-4 w-4" />
              Abrir no Drive
            </a>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-6">
        {msg ? (
          <div className="mb-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-neutral-200">
            <p className="text-sm font-semibold text-neutral-900">
              Arquivos disponíveis no Drive
            </p>

            <button
              type="button"
              onClick={() => router.refresh()}
              className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              title="Recarregar"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>
          </div>

          <div className="h-[72vh] bg-white">
            <iframe
              key={embedUrl}
              src={embedUrl}
              className="w-full h-full"
              allow="clipboard-read; clipboard-write"
              loading="lazy"
              referrerPolicy="no-referrer"
              title="Templates do Legado (Google Drive)"
            />
          </div>
        </div>

        <p className="mt-3 text-xs text-neutral-500">
          Se a lista não aparecer, a pasta do Drive precisa estar compartilhada
          para visualização (pública ou “qualquer pessoa com o link”).
        </p>
      </div>
    </div>
  );
}
