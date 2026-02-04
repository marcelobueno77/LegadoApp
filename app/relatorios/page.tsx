"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type Role = "member" | "leader" | "admin";

export default function RelatoriosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    let alive = true;

    async function check() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!user) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      const role = (prof?.role ?? "member") as Role;
      const can = role === "leader" || role === "admin";

      if (!alive) return;

      setAllowed(can);
      setLoading(false);

      if (!can) router.replace("/dashboard");
    }

    check();

    return () => {
      alive = false;
    };
  }, [router]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Verificando acesso…
          </p>
        </div>
      </div>
    );
  }

  if (!allowed) return null;

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-8 text-center">
        <h1 className="text-2xl font-bold">Relatórios</h1>
        <p className="mt-2 text-neutral-600">
          Página em desenvolvimento. Em breve os relatórios do ministério estarão aqui.
        </p>
      </div>
    </div>
  );
}
