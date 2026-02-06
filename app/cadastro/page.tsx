"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  city: string | null;
  member_since: string | null; // date (YYYY-MM-DD)
  baptized: boolean | null;
};

function normalizeCity(input: string) {
  // Curitiba/PR
  const v = input.trim();
  if (!v) return v;

  // se tiver "Curitiba / PR" -> "Curitiba/PR"
  const cleaned = v.replace(/\s*\/\s*/g, "/");

  // tenta forçar UF em maiúsculo se existir
  const parts = cleaned.split("/");
  if (parts.length === 2) {
    const city = parts[0].trim();
    const uf = parts[1].trim().toUpperCase();
    return `${city}/${uf}`;
  }
  return cleaned;
}

export default function CadastroPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string>("");

  const [profileId, setProfileId] = useState<string>("");

  const [fullName, setFullName] = useState("");
  const [city, setCity] = useState("");
  const [memberSince, setMemberSince] = useState(""); // YYYY-MM-DD
  const [baptized, setBaptized] = useState<"">("");

  const baptizedValue = useMemo(() => {
    if (baptized === "") return null;
    return baptized === "true";
  }, [baptized]);

  useEffect(() => {
    let mounted = true;

    const boot = async () => {
      setMsg("");
      setLoading(true);

      const { data: sessionData, error: sessionError } =
        await supabase.auth.getSession();

      if (!mounted) return;

      if (sessionError) {
        setMsg(sessionError.message);
        setLoading(false);
        return;
      }

      const session = sessionData.session;
      if (!session) {
        router.replace("/login");
        return;
      }

      const user = session.user;
      const userId = user.id;
      setProfileId(userId);

      // 1) tenta buscar profile
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, city, member_since, baptized")
        .eq("id", userId)
        .maybeSingle<Profile>();

      if (!mounted) return;

      if (profileError) {
        setMsg(profileError.message);
        setLoading(false);
        return;
      }

      // 2) se não existir, cria automaticamente
      if (!profile) {
        const inferredName =
          (user.user_metadata?.full_name as string | undefined) ||
          (user.user_metadata?.name as string | undefined) ||
          "";

        const { error: insertError } = await supabase.from("profiles").insert({
          id: userId,
          full_name: inferredName || null,
          city: null,
          member_since: null,
          baptized: null,
        });

        if (!mounted) return;

        if (insertError) {
          setMsg(insertError.message);
          setLoading(false);
          return;
        }

        // seta no form o que a gente inferiu
        setFullName(inferredName);
        setCity("");
        setMemberSince("");
        setBaptized("");
        setLoading(false);
        return;
      }

      // 3) se existe, carrega no form
      setFullName(profile.full_name ?? "");
      setCity(profile.city ?? "");
      setMemberSince(profile.member_since ?? "");
      setBaptized(
        profile.baptized === null ? "" : profile.baptized ? "true" : "false"
      );

      setLoading(false);
    };

    boot();

    return () => {
      mounted = false;
    };
  }, [router]);

  async function handleSave() {
    setMsg("");

    if (!profileId) {
      setMsg("Sessão inválida. Faça login novamente.");
      router.replace("/login");
      return;
    }

    const normalizedCity = normalizeCity(city);

    // validações básicas
    if (!fullName.trim()) {
      setMsg("Informe seu nome.");
      return;
    }

    if (!normalizedCity.trim() || !normalizedCity.includes("/")) {
      setMsg("Informe a cidade no formato Cidade/UF (ex: Curitiba/PR).");
      return;
    }

    const [c, uf] = normalizedCity.split("/");
    if (!c?.trim() || !uf?.trim() || uf.trim().length !== 2) {
      setMsg("UF inválida. Use 2 letras (ex: PR, SP, RJ).");
      return;
    }

    if (!memberSince) {
      setMsg("Informe a data que começou na igreja.");
      return;
    }

    if (baptizedValue === null) {
      setMsg("Informe se você é batizado.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim(),
          city: normalizedCity,
          member_since: memberSince,
          baptized: baptizedValue,
        })
        .eq("id", profileId);

      if (error) {
        setMsg(error.message);
        return;
      }

      router.replace("/dashboard");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar cadastro.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white text-neutral-700">
        <div className="text-sm">Carregando cadastro...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
      <div className="w-full max-w-lg">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <h1 className="text-2xl font-bold">Complete seu cadastro</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Antes de continuar, precisamos de algumas informações.
          </p>

          {msg ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              {msg}
            </div>
          ) : null}

          <div className="mt-5 grid gap-4">
            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Nome completo
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Ex: Marcelo Bueno"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Cidade/UF
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Ex: Curitiba/PR"
              />
              <p className="mt-2 text-xs text-neutral-500">
                Use o formato <b>Cidade/UF</b> (UF com 2 letras).
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Data que começou na igreja
              </label>
              <input
                value={memberSince}
                onChange={(e) => setMemberSince(e.target.value)}
                type="date"
                className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-neutral-700">
                Você é batizado?
              </label>
              <select
                value={baptized}
                onChange={(e) => setBaptized(e.target.value as any)}
                className="mt-2 w-full rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
              >
                <option value="">Selecione...</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              onClick={handleSave}
              disabled={saving}
              className="w-full rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-600 active:scale-[0.99] transition disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar e continuar"}
            </button>
          </div>

          <p className="mt-4 text-center text-xs text-neutral-500">
            Seus dados podem ser atualizados depois no painel.
          </p>
        </div>
      </div>
    </div>
  );
}
