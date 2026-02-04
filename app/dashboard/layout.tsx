"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase/client";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let alive = true;

    async function checkSession() {
      const { data } = await supabase.auth.getSession();
      const session = data.session;

      // sem sessão -> manda pro login
      if (!session) {
        router.replace("/login");
        return;
      }

      // com sessão -> libera
      if (alive) setChecking(false);
    }

    checkSession();

    // se deslogar em outra aba, expulsa do dashboard
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  if (checking) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Verificando login…
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
