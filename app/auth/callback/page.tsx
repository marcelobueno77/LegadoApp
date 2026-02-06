"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

export default function AuthCallbackPage() {
  const router = useRouter();

  useEffect(() => {
    const finalizeLogin = async () => {
      // garante que a sessão foi carregada
      const { data, error } = await supabase.auth.getSession();

      if (error) {
        console.error("Erro ao finalizar login:", error.message);
        router.replace("/login");
        return;
      }

      if (data.session) {
        // login ok → dashboard
        router.replace("/dashboard");
      } else {
        // sem sessão → volta pro login
        router.replace("/login");
      }
    };

    finalizeLogin();
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-white text-neutral-700">
      <div className="text-sm">
        Finalizando login, aguarde...
      </div>
    </div>
  );
}
