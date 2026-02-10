"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();
  const ranRef = useRef(false);

  useEffect(() => {
    // ✅ evita rodar 2x no React Strict Mode (dev) e causar lentidão/duplicidade
    if (ranRef.current) return;
    ranRef.current = true;

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // Se veio com code (PKCE), troca por sessão
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) {
            console.error("exchangeCodeForSession error:", error.message);
          }
        }

        // Aguarda um tick para o estado de auth estabilizar (evita navegação "pesada" em alguns casos)
        await new Promise((r) => setTimeout(r, 0));
      } catch (e) {
        console.error("callback error:", e);
      } finally {
        // ✅ replace pra não deixar callback no histórico
        router.replace("/dashboard");
      }
    };

    run();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-neutral-700">
      <div className="text-sm">Finalizando login...</div>
    </div>
  );
}
