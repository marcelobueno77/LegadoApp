"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  city: string | null;
  member_since: string | null;
  baptized: boolean | null;
};

function isProfileComplete(p: Profile | null) {
  if (!p) return false;

  // Ajuste aqui quais campos são obrigatórios
  const requiredText = [p.full_name, p.city, p.member_since];

  const hasAllText = requiredText.every((v) => (v ?? "").trim().length > 0);

  // baptized pode ser null (não respondeu) -> considera incompleto
  const hasBaptized = p.baptized !== null;

  return hasAllText && hasBaptized;
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [ready, setReady] = useState(false);

  const publicRoutes = useMemo(() => {
    // rotas que não exigem login
    return new Set<string>(["/login", "/auth/callback"]);
  }, []);

  const onboardingRoute = "/cadastro";

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!mounted) return;

      const session = sessionData.session;
      const isPublic = publicRoutes.has(pathname);

      // 1) Não logado tentando rota protegida
      if (!session && !isPublic) {
        router.replace("/login");
        setReady(true);
        return;
      }

      // 2) Logado e está no /login -> manda pro dashboard (ou cadastro, dependendo do perfil)
      if (session && pathname === "/login") {
        // cai para checagem de perfil abaixo
      }

      // 3) Se está logado, checa perfil (completa ou não)
      if (session) {
        const userId = session.user.id;

        const { data: profile, error } = await supabase
          .from("profiles")
          .select("id, full_name, city, member_since, baptized")
          .eq("id", userId)
          .maybeSingle<Profile>();

        // Se deu erro, por segurança deixa entrar (ou você pode mandar pro /login)
        if (error) {
          console.error("Erro ao buscar profile:", error.message);
          setReady(true);
          return;
        }

        const complete = isProfileComplete(profile ?? null);

        // Se perfil incompleto e não está no cadastro -> manda pro cadastro
        if (!complete && pathname !== onboardingRoute) {
          router.replace(onboardingRoute);
          setReady(true);
          return;
        }

        // Se perfil completo e está no cadastro -> manda pro dashboard
        if (complete && pathname === onboardingRoute) {
          router.replace("/dashboard");
          setReady(true);
          return;
        }

        // Se perfil completo e está no /login -> dashboard
        if (complete && pathname === "/login") {
          router.replace("/dashboard");
          setReady(true);
          return;
        }

        // Se perfil incompleto e está no /login -> cadastro
        if (!complete && pathname === "/login") {
          router.replace(onboardingRoute);
          setReady(true);
          return;
        }
      }

      setReady(true);
    };

    run();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const isPublic = publicRoutes.has(pathname);

      // deslogou em rota protegida
      if (!session && !isPublic) {
        router.replace("/login");
        return;
      }

      // logou -> checa perfil e direciona
      if (session) {
        const userId = session.user.id;

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, full_name, city, member_since, baptized")
          .eq("id", userId)
          .maybeSingle<Profile>();

        const complete = isProfileComplete(profile ?? null);

        if (!complete && pathname !== onboardingRoute) router.replace(onboardingRoute);
        if (complete && (pathname === "/login" || pathname === onboardingRoute))
          router.replace("/dashboard");
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname, publicRoutes, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-neutral-700">
        <div className="text-sm">Carregando...</div>
      </div>
    );
  }

  return <>{children}</>;
}
