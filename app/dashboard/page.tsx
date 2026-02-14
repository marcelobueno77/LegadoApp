"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  Users,
  CalendarDays,
  ClipboardList,
  BarChart3,
  LogOut,
  ShoppingCart,
  Lock,
  MapPin,
  Building2,
} from "lucide-react";
import Image from "next/image";

type Role = "member" | "leader" | "director" | "admin";

function Card({
  title,
  desc,
  icon,
  onClick,
  locked,
}: {
  title: string;
  desc: string;
  icon: React.ReactNode;
  onClick?: () => void;
  locked?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 p-5 transition active:scale-[0.99]
        ${locked ? "opacity-70 hover:shadow-md" : "hover:shadow-lg"}`}
    >
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl bg-white ring-1 ring-neutral-200 flex items-center justify-center shadow overflow-hidden">
          <span className="text-neutral-900">{icon}</span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-3">
            <p className="font-semibold text-neutral-900">{title}</p>

            {locked ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1 text-[11px] font-semibold text-neutral-700 ring-1 ring-neutral-200">
                <Lock className="h-3.5 w-3.5" />
                Restrito
              </span>
            ) : null}
          </div>

          <p className="mt-1 text-sm text-neutral-600">{desc}</p>
        </div>
      </div>
    </button>
  );
}

function CardLink({
  href,
  title,
  desc,
  icon,
  locked,
  onLockedClick,
}: {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  locked?: boolean;
  onLockedClick?: () => void;
}) {
  // ✅ quando não está bloqueado, vira Link com prefetch (navegação mais rápida)
  if (!locked) {
    return (
      <Link href={href} prefetch className="block">
        <div className="w-full text-left rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 p-5 transition active:scale-[0.99] hover:shadow-lg">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-white ring-1 ring-neutral-200 flex items-center justify-center shadow overflow-hidden">
              <span className="text-neutral-900">{icon}</span>
            </div>

            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-3">
                <p className="font-semibold text-neutral-900">{title}</p>
              </div>

              <p className="mt-1 text-sm text-neutral-600">{desc}</p>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // ✅ bloqueado: mantém comportamento atual (mostra msg)
  return (
    <Card title={title} desc={desc} icon={icon} onClick={onLockedClick} locked />
  );
}

export default function DashboardPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState<string>("");

  const ranRef = useRef(false);

  // ✅ usado para controle de acesso ao /relatorios (mantido)
  const canSeeReports = useMemo(
    () => role === "leader" || role === "director" || role === "admin",
    [role]
  );

  // ✅ NOVO: Relatórios só APARECEM se NÃO for member
  const showReportsCard = useMemo(() => role !== "member", [role]);

  // ✅ NOVO: card invisível para qualquer um que não seja admin/diretor
  const canSeeCityAdminCard = useMemo(
    () => role === "admin" || role === "director",
    [role]
  );

  useEffect(() => {
    // ✅ evita rodar 2x no Strict Mode (dev)
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

      const { data: prof, error } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", sessionUser.id)
        .single();

      if (!mounted) return;

      if (error) {
        setMsg(error.message);
        setRole("member");
      } else {
        setRole((prof?.role ?? "member") as Role);
      }

      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const sessionUser = session?.user ?? null;
        setUser(sessionUser);

        if (!sessionUser) {
          router.replace("/login");
          return;
        }

        const { data: prof } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", sessionUser.id)
          .single();

        setRole((prof?.role ?? "member") as Role);
      }
    );

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function handleLogout() {
    await supabase.auth.signOut();
    router.replace("/login");
  }

  function goReports() {
    setMsg("");
    if (!canSeeReports) {
      setMsg(
        "🔒 Relatórios: acesso permitido somente para Líderes, Diretores e Admin."
      );
      return;
    }
    router.push("/relatorios");
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Carregando painel…
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
              <h1 className="text-lg font-bold">Painel</h1>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-neutral-500">Logado como</p>
              <p className="text-sm font-semibold text-neutral-900 truncate max-w-[220px]">
                {user?.email}
              </p>
              <p className="text-xs text-neutral-500">
                Perfil:{" "}
                <span className="font-semibold text-neutral-700">{role}</span>
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
            >
              <LogOut className="h-4 w-4" />
              Sair
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-neutral-900">Bem-vindo 👋</h2>
          <p className="mt-1 text-neutral-600">Escolha uma área para começar.</p>

          {msg ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              {msg}
            </div>
          ) : null}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <CardLink
            href="/membros"
            title="Cadastro de Membros"
            desc="Faça seu cadastro e mantenha suas informações atualizadas."
            icon={<Users className="h-5 w-5" />}
          />

          <CardLink
            href="/eventos"
            title="Eventos"
            desc="Veja a lista de encontros, atividades e agenda do ministério."
            icon={<CalendarDays className="h-5 w-5" />}
          />

          <CardLink
            href="/cidades"
            title="Cidades"
            desc="Veja as cidades e contatos de liderança por UF."
            icon={<MapPin className="h-5 w-5" />}
          />

          {/* ✅ RELATÓRIOS: só aparece se role != member */}
          {showReportsCard ? (
            <CardLink
              href="/relatorios"
              title="Relatórios"
              desc="Acompanhe indicadores do ministério."
              icon={<BarChart3 className="h-5 w-5" />}
              locked={!canSeeReports}
              onLockedClick={goReports}
            />
          ) : null}

          {/* ✅ NOVO CARD (SÓ ADMIN/DIRECTOR) */}
          {canSeeCityAdminCard ? (
            <CardLink
              href="/cadastro/cidades"
              title="Cadastro de Cidades"
              desc="Gerencie o cadastro das cidades do Ministério Legado."
              icon={<Building2 className="h-5 w-5" />}
            />
          ) : null}

          <CardLink
            href="/documentos"
            title="Documentos"
            desc="Acesse materiais oficiais e documentos do ministério."
            icon={<ClipboardList className="h-5 w-5" />}
          />

          <CardLink
            href="/produtos"
            title="Produtos"
            desc="Escolha itens, monte um carrinho e envie sua solicitação por e-mail."
            icon={<ShoppingCart className="h-5 w-5" />}
          />
        </div>
      </div>
    </div>
  );
}
