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
  if (typeof v === "boolean") return true; // boolean sempre conta como preenchido
  return v !== null && v !== undefined;
}

// 🔒 TODOS OBRIGATÓRIOS
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
      // ✅ failsafe: se algo der ruim, não fica travado
      const failsafe = setTimeout(() => {
        if (mounted) setReady(true);
      }, 2500);

      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (!mounted) return;

        // Mesmo com erro, libera a tela
        if (sessionError) {
          console.error("AuthGate getSession error:", sessionError.message);

          // se está em rota protegida e não dá pra validar sessão, manda pro login
          if (!publicRoutes.has(pathname)) {
            router.replace("/login");
          }

          return;
        }

        const session = sessionData.session;
        const isPublic = publicRoutes.has(pathname);

        // ❌ Sem sessão em rota protegida
        if (!session && !isPublic) {
          router.replace("/login");
          return;
        }

        // ✅ Com sessão: checa profile
        if (session) {
          const userId = session.user.id;

          const { data: profile, error: profileError } = await supabase
            .from("profiles")
            .select(
              "id, full_name, vest_name, birth_date, phone, address_street, city, cep, leader_name, pastor_name, member_since, baptized"
            )
            .eq("id", userId)
            .maybeSingle<Profile>();

          if (!mounted) return;

          if (profileError) {
            console.error("AuthGate profile error:", profileError.message);

            // Se falhar o select (RLS etc.), não trava.
            // Mantém o usuário na rota, mas se for rota protegida e estiver sem profile, empurra pro cadastro (seguro).
            if (!isPublic && pathname !== onboardingRoute) {
              router.replace(onboardingRoute);
            }
            return;
          }

          const complete = isProfileComplete(profile ?? null);

          // 🚧 incompleto → cadastro
          if (!complete && pathname !== onboardingRoute) {
            router.replace(onboardingRoute);
            return;
          }

          // ✅ completo → dashboard (se estiver no login/cadastro)
          if (complete && (pathname === "/login" || pathname === onboardingRoute)) {
            router.replace("/dashboard");
            return;
          }

          // ✅ se estiver no /login logado, manda pro lugar certo
          if (pathname === "/login") {
            router.replace(complete ? "/dashboard" : onboardingRoute);
            return;
          }
        }
      } catch (err: any) {
        console.error("AuthGate unexpected error:", err?.message ?? err);
        // não trava
      } finally {
        clearTimeout(failsafe);
        if (mounted) setReady(true);
      }
    };

    guard();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
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
            "id, full_name, vest_name, birth_date, phone, address_street, city, cep, leader_name, pastor_name, member_since, baptized"
          )
          .eq("id", userId)
          .maybeSingle<Profile>();

        const complete = isProfileComplete(profile ?? null);

        if (!complete && pathname !== onboardingRoute) {
          router.replace(onboardingRoute);
          return;
        }

        if (complete && (pathname === "/login" || pathname === onboardingRoute)) {
          router.replace("/dashboard");
        }
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
