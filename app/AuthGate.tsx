"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  vest_name: string | null;

  birth_date: string | null;
  phone: string | null;

  address_street: string | null;
  city: string | null;
  cep: string | null;

  leader_name: string | null;
  pastor_name: string | null;

  member_since: string | null;
  baptized: boolean | null;
};

function isFilled(v: any) {
  if (typeof v === "string") return v.trim().length > 0;
  if (typeof v === "boolean") return true;
  return v !== null && v !== undefined;
}

/**
 * 🔒 CADASTRO 100% OBRIGATÓRIO
 */
function isProfileComplete(p: Profile | null) {
  if (!p) return false;

  return (
    isFilled(p.full_name) &&
    isFilled(p.vest_name) &&
    isFilled(p.birth_date) &&
    isFilled(p.phone) &&
    isFilled(p.address_street) &&
    isFilled(p.city) &&
    isFilled(p.cep) &&
    isFilled(p.leader_name) &&
    isFilled(p.pastor_name) &&
    isFilled(p.member_since) &&
    isFilled(p.baptized)
  );
}

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);

  const publicRoutes = useMemo(
    () => new Set<string>(["/login", "/auth/callback"]),
    []
  );

  const onboardingRoute = "/cadastro";

  useEffect(() => {
    let mounted = true;

    const guard = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const session = data.session;
      const isPublic = publicRoutes.has(pathname);

      // ❌ não logado tentando rota protegida
      if (!session && !isPublic) {
        router.replace("/login");
        setReady(true);
        return;
      }

      // ✅ logado → checa cadastro
      if (session) {
        const userId = session.user.id;

        const { data: profile, error } = await supabase
          .from("profiles")
          .select(
            `
            id,
            full_name,
            vest_name,
            birth_date,
            phone,
            address_street,
            city,
            cep,
            leader_name,
            pastor_name,
            member_since,
            baptized
          `
          )
          .eq("id", userId)
          .maybeSingle<Profile>();

        if (!mounted) return;

        if (error) {
          console.error("Erro ao buscar profile:", error.message);
          setReady(true);
          return;
        }

        const complete = isProfileComplete(profile ?? null);

        // 🚧 cadastro incompleto
        if (!complete && pathname !== onboardingRoute) {
          router.replace(onboardingRoute);
          setReady(true);
          return;
        }

        // ✅ cadastro completo
        if (complete && pathname === onboardingRoute) {
          router.replace("/dashboard");
          setReady(true);
          return;
        }

        // 🔄 logado e tentando acessar /login
        if (pathname === "/login") {
          router.replace(complete ? "/dashboard" : onboardingRoute);
          setReady(true);
          return;
        }
      }

      setReady(true);
    };

    guard();

    const { data: sub } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const isPublic = publicRoutes.has(pathname);

        // logout
        if (!session && !isPublic) {
          router.replace("/login");
          return;
        }

        // login
        if (session) {
          const userId = session.user.id;

          const { data: profile } = await supabase
            .from("profiles")
            .select(
              `
              id,
              full_name,
              vest_name,
              birth_date,
              phone,
              address_street,
              city,
              cep,
              leader_name,
              pastor_name,
              member_since,
              baptized
            `
            )
            .eq("id", userId)
            .maybeSingle<Profile>();

          const complete = isProfileComplete(profile ?? null);

          if (!complete && pathname !== onboardingRoute) {
            router.replace(onboardingRoute);
          }

          if (complete && (pathname === "/login" || pathname === onboardingRoute)) {
            router.replace("/dashboard");
          }
        }
      }
    );

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
