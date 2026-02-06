"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/app/lib/supabase/client";

type Profile = {
  id: string;
  full_name: string | null;
  vest_name: string | null;

  birth_date: string | null; // YYYY-MM-DD
  phone: string | null;

  address_street: string | null;
  city: string | null; // Curitiba/PR
  cep: string | null;

  leader_name: string | null;
  pastor_name: string | null;

  member_since: string | null; // YYYY-MM-DD
  baptized: boolean | null;
};

function normalizeCity(input: string) {
  const v = (input ?? "").trim();
  if (!v) return v;

  const cleaned = v.replace(/\s*\/\s*/g, "/");
  const parts = cleaned.split("/");
  if (parts.length === 2) {
    const city = parts[0].trim();
    const uf = parts[1].trim().toUpperCase();
    return `${city}/${uf}`;
  }
  return cleaned;
}

function onlyDigits(v: string) {
  return (v ?? "").replace(/\D/g, "");
}

function formatCep(v: string) {
  const d = onlyDigits(v).slice(0, 8);
  if (d.length <= 5) return d;
  return `${d.slice(0, 5)}-${d.slice(5)}`;
}

function formatPhone(v: string) {
  const d = onlyDigits(v).slice(0, 11);
  // (41) 99999-9999
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 11)
    return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  return d;
}

export default function CadastroPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState("");

  const [profileId, setProfileId] = useState("");

  // Campos do formulário
  const [fullName, setFullName] = useState("");
  const [vestName, setVestName] = useState("");

  const [birthDate, setBirthDate] = useState(""); // YYYY-MM-DD
  const [phone, setPhone] = useState("");

  const [addressStreet, setAddressStreet] = useState("");
  const [city, setCity] = useState("");
  const [cep, setCep] = useState("");

  const [leaderName, setLeaderName] = useState("");
  const [pastorName, setPastorName] = useState("");

  const [memberSince, setMemberSince] = useState(""); // YYYY-MM-DD
  const [baptized, setBaptized] = useState<"" | "true" | "false">("");

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

      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select(
          "id, full_name, vest_name, birth_date, phone, address_street, city, cep, leader_name, pastor_name, member_since, baptized"
        )
        .eq("id", userId)
        .maybeSingle<Profile>();

      if (!mounted) return;

      if (profileError) {
        setMsg(profileError.message);
        setLoading(false);
        return;
      }

      // Se não existir, cria
      if (!profile) {
        const inferredName =
          (user.user_metadata?.full_name as string | undefined) ||
          (user.user_metadata?.name as string | undefined) ||
          "";

        const { error: insertError } = await supabase.from("profiles").insert({
          id: userId,
          full_name: inferredName || null,
          vest_name: null,
          birth_date: null,
          phone: null,
          address_street: null,
          city: null,
          cep: null,
          leader_name: null,
          pastor_name: null,
          member_since: null,
          baptized: null,
        });

        if (!mounted) return;

        if (insertError) {
          setMsg(insertError.message);
          setLoading(false);
          return;
        }

        // seta defaults no form
        setFullName(inferredName);
        setVestName("");
        setBirthDate("");
        setPhone("");
        setAddressStreet("");
        setCity("");
        setCep("");
        setLeaderName("");
        setPastorName("");
        setMemberSince("");
        setBaptized("");

        setLoading(false);
        return;
      }

      // Carrega no form
      setFullName(profile.full_name ?? "");
      setVestName(profile.vest_name ?? "");
      setBirthDate(profile.birth_date ?? "");
      setPhone(profile.phone ?? "");

      setAddressStreet(profile.address_street ?? "");
      setCity(profile.city ?? "");
      setCep(profile.cep ?? "");

      setLeaderName(profile.leader_name ?? "");
      setPastorName(profile.pastor_name ?? "");

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

  function validate() {
    const fn = fullName.trim();
    if (!fn) return "Informe seu nome.";

    const normalizedCity = normalizeCity(city);
    if (!normalizedCity || !normalizedCity.includes("/"))
      return "Informe a cidade no formato Cidade/UF (ex: Curitiba/PR).";

    const [c, uf] = normalizedCity.split("/");
    if (!c?.trim() || !uf?.trim() || uf.trim().length !== 2)
      return "UF inválida. Use 2 letras (ex: PR, SP, RJ).";

    if (!memberSince) return "Informe desde quando é membro (data).";

    if (baptizedValue === null) return "Informe se você é batizado.";

    return "";
  }

  async function handleSave() {
    setMsg("");

    if (!profileId) {
      setMsg("Sessão inválida. Faça login novamente.");
      router.replace("/login");
      return;
    }

    const errorMsg = validate();
    if (errorMsg) {
      setMsg(errorMsg);
      return;
    }

    const normalizedCity = normalizeCity(city);

    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: fullName.trim() || null,
          vest_name: vestName.trim() || null,

          birth_date: birthDate || null,
          phone: phone.trim() || null,

          address_street: addressStreet.trim() || null,
          city: normalizedCity || null,
          cep: cep.trim() || null,

          leader_name: leaderName.trim() || null,
          pastor_name: pastorName.trim() || null,

          member_since: memberSince || null,
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
      <div className="w-full max-w-5xl">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-8">
          <h1 className="text-2xl font-bold">Complete seu cadastro</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Antes de continuar, preencha as informações abaixo.
          </p>

          {msg ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              {msg}
            </div>
          ) : null}

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Nome */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Nome <span className="text-red-600">*</span>
              </label>
              <input
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Seu nome completo"
              />
            </div>

            {/* Nome no Colete */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Nome no Colete
              </label>
              <input
                value={vestName}
                onChange={(e) => setVestName(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Ex: MARCELO BUENO"
              />
            </div>

            {/* Data Nascimento */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Data de Nascimento
              </label>
              <input
                type="date"
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
              />
            </div>

            {/* Telefone */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Telefone
              </label>
              <input
                value={phone}
                onChange={(e) => setPhone(formatPhone(e.target.value))}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="(41) 99999-9999"
              />
            </div>

            {/* Endereço */}
            <div className="md:col-span-2">
              <label className="text-sm font-semibold text-neutral-700">
                Endereço (nome e rua)
              </label>
              <input
                value={addressStreet}
                onChange={(e) => setAddressStreet(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Rua / Av / número / bairro"
              />
            </div>

            {/* Cidade/UF */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Cidade/UF <span className="text-red-600">*</span>
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Curitiba/PR"
              />
            </div>

            {/* CEP */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                CEP
              </label>
              <input
                value={cep}
                onChange={(e) => setCep(formatCep(e.target.value))}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="00000-000"
              />
            </div>

            {/* Líder */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Nome do Líder
              </label>
              <input
                value={leaderName}
                onChange={(e) => setLeaderName(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Nome do líder"
              />
            </div>

            {/* Pastor */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                Nome do Pastor
              </label>
              <input
                value={pastorName}
                onChange={(e) => setPastorName(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
                placeholder="Nome do pastor"
              />
            </div>

            {/* Membro desde */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                É membro da Bola de Neve desde?{" "}
                <span className="text-red-600">*</span>
              </label>
              <input
                type="date"
                value={memberSince}
                onChange={(e) => setMemberSince(e.target.value)}
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
              />
            </div>

            {/* Batizado */}
            <div>
              <label className="text-sm font-semibold text-neutral-700">
                É batizado? <span className="text-red-600">*</span>
              </label>
              <select
                value={baptized}
                onChange={(e) =>
                  setBaptized(e.target.value as "" | "true" | "false")
                }
                className="mt-2 w-full rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
              >
                <option value="">Selecione...</option>
                <option value="true">Sim</option>
                <option value="false">Não</option>
              </select>
            </div>
          </div>

          <div className="mt-8 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => router.back()}
              className="rounded-2xl bg-white px-6 py-3 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Voltar
            </button>

            <button
              type="button"
              onClick={handleSave}
              disabled={saving}
              className="rounded-2xl bg-blue-700 px-6 py-3 text-sm font-semibold text-white shadow hover:bg-blue-600 active:scale-[0.99] transition disabled:opacity-60"
            >
              {saving ? "Salvando..." : "Salvar cadastro"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
