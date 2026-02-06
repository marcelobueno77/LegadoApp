"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [ready, setReady] = useState(false);

  const publicRoutes = useMemo(() => {
    // rotas que não exigem login
    return new Set<string>(["/login", "/auth/callback"]);
  }, []);

  useEffect(() => {
    let mounted = true;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;

      const hasSession = !!data.session;
      const isPublic = publicRoutes.has(pathname);

      // se estiver na tela de login e já estiver logado -> dashboard
      if (pathname === "/login" && hasSession) {
        router.replace("/dashboard");
        setReady(true);
        return;
      }

      // se estiver em rota protegida e não tiver sessão -> login
      if (!isPublic && !hasSession) {
        router.replace("/login");
        setReady(true);
        return;
      }

      setReady(true);
    };

    check();

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      const hasSession = !!session;
      const isPublic = publicRoutes.has(pathname);

      // entrou (Google ou email/senha) e ainda está no login -> dashboard
      if (pathname === "/login" && hasSession) {
        router.replace("/dashboard");
        return;
      }

      // saiu e está em rota protegida -> login
      if (!isPublic && !hasSession) {
        router.replace("/login");
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
