"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");

        // Se veio com code (PKCE), troca por sessão
        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) console.error("exchangeCodeForSession error:", error.message);
        }

        // Se não veio com code, ainda assim tenta seguir (email/senha não usa code)
      } catch (e) {
        console.error("callback error:", e);
      } finally {
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
