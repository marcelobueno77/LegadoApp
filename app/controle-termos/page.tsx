"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  ExternalLink,
  Save,
  RefreshCw,
  FolderOpen,
  MapPin,
  ShieldCheck,
} from "lucide-react";

type Role = "member" | "leader" | "director" | "admin";

type Profile = {
  id: string;
  role: Role;
  city: string | null;
};

type TermItem = {
  id: string;
  city: string;
  drive_link: string;
  created_at: string;
};

function extractUf(city: string | null) {
  if (!city) return "";
  const parts = city.split("/");
  return (parts[1] || "").trim().toUpperCase();
}

export default function ControleTermosPage() {
  const router = useRouter();
  const ranRef = useRef(false);

  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loadingPage, setLoadingPage] = useState(true);
  const [loadingTerms, setLoadingTerms] = useState(false);
  const [saving, setSaving] = useState(false);

  const [msg, setMsg] = useState("");
  const [items, setItems] = useState<TermItem[]>([]);

  const [city, setCity] = useState("");
  const [driveLink, setDriveLink] = useState("");

  const isAdmin = useMemo(() => profile?.role === "admin", [profile?.role]);
  const isDirector = useMemo(() => profile?.role === "director", [profile?.role]);
  const userCity = profile?.city ?? "";
  const userUf = useMemo(() => extractUf(profile?.city ?? ""), [profile?.city]);

  async function loadTerms(currentProfile: Profile) {
    setLoadingTerms(true);
    setMsg("");

    let query = supabase
      .from("terms_control")
      .select("id, city, drive_link, created_at")
      .order("city", { ascending: true });

    if (currentProfile.role === "admin") {
      // admin vê tudo
    } else if (currentProfile.role === "director") {
      const uf = extractUf(currentProfile.city);
      if (!uf) {
        setItems([]);
        setLoadingTerms(false);
        setMsg("Seu cadastro não possui UF válida em profiles.city.");
        return;
      }
      query = query.like("city", `%/${uf}`);
    } else {
      if (!currentProfile.city) {
        setItems([]);
        setLoadingTerms(false);
        setMsg("Seu cadastro não possui cidade definida em profiles.city.");
        return;
      }
      query = query.eq("city", currentProfile.city);
    }

    const { data, error } = await query;

    if (error) {
      setItems([]);
      setMsg(error.message);
    } else {
      setItems((data ?? []) as TermItem[]);
    }

    setLoadingTerms(false);
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let mounted = true;

    async function load() {
      setLoadingPage(true);
      setMsg("");

      const { data: authData, error: authError } = await supabase.auth.getSession();
      const sessionUser = authData.session?.user ?? null;

      if (!mounted) return;

      if (authError) {
        setMsg(authError.message);
        setLoadingPage(false);
        return;
      }

      if (!sessionUser) {
        router.replace("/login");
        return;
      }

      setUser(sessionUser);

      const { data: prof, error: profError } = await supabase
        .from("profiles")
        .select("id, role, city")
        .eq("id", sessionUser.id)
        .single();

      if (!mounted) return;

      if (profError || !prof) {
        setMsg(profError?.message || "Não foi possível carregar seu perfil.");
        setLoadingPage(false);
        return;
      }

      const normalizedProfile = prof as Profile;
      setProfile(normalizedProfile);

      await loadTerms(normalizedProfile);

      setLoadingPage(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const sessionUser = session?.user ?? null;
      setUser(sessionUser);

      if (!sessionUser) {
        router.replace("/login");
        return;
      }

      const { data: prof } = await supabase
        .from("profiles")
        .select("id, role, city")
        .eq("id", sessionUser.id)
        .single();

      if (prof) {
        const normalizedProfile = prof as Profile;
        setProfile(normalizedProfile);
        await loadTerms(normalizedProfile);
      }
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function handleSave() {
    if (!isAdmin || !user) return;

    const cleanCity = city.trim();
    const cleanDriveLink = driveLink.trim();

    if (!cleanCity) {
      setMsg("Informe a cidade.");
      return;
    }

    if (!cleanDriveLink) {
      setMsg("Informe o link do Drive.");
      return;
    }

    if (!/^https?:\/\//i.test(cleanDriveLink)) {
      setMsg("Informe um link válido começando com http:// ou https://");
      return;
    }

    setSaving(true);
    setMsg("");

    const { error } = await supabase.from("terms_control").upsert(
      {
        city: cleanCity,
        drive_link: cleanDriveLink,
        created_by: user.id,
      },
      { onConflict: "city" }
    );

    if (error) {
      setMsg(error.message);
    } else {
      setCity("");
      setDriveLink("");
      setMsg("Termo salvo com sucesso.");
      if (profile) {
        await loadTerms(profile);
      }
    }

    setSaving(false);
  }

  async function handleRefresh() {
    if (!profile) return;
    await loadTerms(profile);
  }

  if (loadingPage) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">
            Carregando controle de termos…
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <div className="sticky top-0 z-10 bg-white/80 backdrop-blur border-b border-neutral-200">
        <div className="mx-auto max-w-5xl px-6 py-4 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => router.push("/dashboard")}
              className="inline-flex items-center gap-2 rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm font-semibold text-neutral-800 shadow-sm hover:bg-neutral-50"
            >
              <ArrowLeft className="h-4 w-4" />
              Voltar
            </button>

            <div>
              <p className="text-sm text-neutral-500">LegadoApp</p>
              <h1 className="text-lg font-bold">Controle de Termos</h1>
            </div>
          </div>

          <button
            onClick={handleRefresh}
            className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800"
          >
            <RefreshCw className="h-4 w-4" />
            Atualizar
          </button>
        </div>
      </div>

      <div className="mx-auto max-w-5xl px-6 py-8">
        <div className="mb-6">
          <h2 className="text-2xl font-bold text-neutral-900">Termos por cidade</h2>
          <p className="mt-1 text-neutral-600">
            Admin vê todos. Director vê somente cidades do seu estado. Líder e membro veem somente a própria cidade.
          </p>

          <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500">Perfil</p>
              <p className="mt-1 font-semibold">{profile?.role ?? "-"}</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500">Cidade do cadastro</p>
              <p className="mt-1 font-semibold">{userCity || "-"}</p>
            </div>

            <div className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm">
              <p className="text-xs text-neutral-500">UF considerada</p>
              <p className="mt-1 font-semibold">{userUf || "-"}</p>
            </div>
          </div>

          {msg ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              {msg}
            </div>
          ) : null}
        </div>

        {isAdmin ? (
          <div className="mb-8 rounded-3xl border border-neutral-200 bg-white p-5 shadow-md">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="h-5 w-5" />
              <h3 className="text-lg font-bold">Cadastro de Termos</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Cidade
                </label>
                <input
                  type="text"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="Ex.: Curitiba/PR"
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium text-neutral-700">
                  Link compartilhável do Drive
                </label>
                <input
                  type="url"
                  value={driveLink}
                  onChange={(e) => setDriveLink(e.target.value)}
                  placeholder="https://drive.google.com/..."
                  className="w-full rounded-xl border border-neutral-300 px-4 py-3 outline-none focus:ring-2 focus:ring-neutral-300"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 disabled:opacity-60"
              >
                <Save className="h-4 w-4" />
                {saving ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        ) : null}

        <div className="rounded-3xl border border-neutral-200 bg-white p-5 shadow-md">
          <div className="flex items-center gap-2 mb-4">
            <FolderOpen className="h-5 w-5" />
            <h3 className="text-lg font-bold">Lista de Termos</h3>
          </div>

          {loadingTerms ? (
            <div className="rounded-2xl border border-neutral-200 bg-neutral-50 p-4 text-sm text-neutral-700">
              Carregando termos...
            </div>
          ) : items.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-neutral-300 bg-neutral-50 p-6 text-sm text-neutral-600">
              Nenhum termo encontrado para o seu escopo.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {items.map((item) => (
                <div
                  key={item.id}
                  className="rounded-2xl border border-neutral-200 bg-white p-4 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-neutral-900">
                        <MapPin className="h-4 w-4" />
                        <p className="font-semibold wrap-break-word">{item.city}</p>
                      </div>

                      <p className="mt-2 text-sm text-neutral-600 break-all">
                        {item.drive_link}
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <a
                      href={item.drive_link}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800"
                    >
                      <ExternalLink className="h-4 w-4" />
                      Abrir termo
                    </a>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}