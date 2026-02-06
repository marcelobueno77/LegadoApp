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
      const failsafe = setTimeout(() => {
        if (mounted) setReady(true);
      }, 2500);

      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.getSession();

        if (!mounted) return;

        if (sessionError) {
          console.error("getSession error:", sessionError.message);
          if (!publicRoutes.has(pathname)) router.replace("/login");
          return;
        }

        const session = sessionData.session;
        const isPublic = publicRoutes.has(pathname);

        if (!session && !isPublic) {
          router.replace("/login");
          return;
        }

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
            console.error("profileError:", profileError.message);
            if (!isPublic && pathname !== onboardingRoute) router.replace(onboardingRoute);
            return;
          }

          const complete = isProfileComplete(profile ?? null);

          if (!complete && pathname !== onboardingRoute) {
            router.replace(onboardingRoute);
            return;
          }

          if (complete && (pathname === "/login" || pathname === onboardingRoute)) {
            router.replace("/dashboard");
            return;
          }

          if (pathname === "/login") {
            router.replace(complete ? "/dashboard" : onboardingRoute);
            return;
          }
        }
      } catch (e: any) {
        console.error("AuthGate unexpected error:", e?.message ?? e);
      } finally {
        clearTimeout(failsafe);
        if (mounted) setReady(true);
      }
    };

    guard();

    const { data: sub } = supabase.auth.onAuthStateChange(() => {
      // não precisa travar aqui; guard() resolve o resto
      guard();
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [pathname, publicRoutes, router]);

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-neutral-700">
        <div className="text-sm">Verificando login...</div>
      </div>
    );
  }

  return <>{children}</>;
}
