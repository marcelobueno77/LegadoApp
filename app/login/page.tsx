"use client";

import { useState } from "react";
import { Mail, Lock, Chrome, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "../lib/supabase/client";


export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string>("");

  async function handleSignUp() {
    setMsg("");

    if (!email || !password) {
      setMsg("Preencha email e senha.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signUp({ email, password });

      if (error) {
        setMsg(error.message);
        return;
      }

      setMsg("✅ Conta criada! Agora clique em Entrar.");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  }

  async function handleSignIn() {
    setMsg("");

    if (!email || !password) {
      setMsg("Preencha email e senha.");
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setMsg(error.message);
        return;
      }

      // logou -> vai pro dashboard
      window.location.href = "/dashboard";
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 flex items-center justify-center p-6">
      <div className="w-full max-w-sm">
        {/* badge */}
        <div className="mb-5 flex items-center justify-center gap-2">
          <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-purple-600 text-white shadow">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-sm font-semibold text-neutral-700">
            Bem-vindo ao LegadoApp
          </span>
          <span className="ml-2 text-xs text-green-700 font-semibold">
            JS OK ✅
          </span>
        </div>

        {/* card */}
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <h1 className="text-2xl font-bold text-neutral-900">Entrar</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Acesse com Google ou com email e senha.
          </p>

          {/* msg */}
          {msg ? (
            <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
              {msg}
            </div>
          ) : null}

          {/* google (vamos ligar depois) */}
          <button
            type="button"
            disabled
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow opacity-60 cursor-not-allowed"
            title="Vamos conectar depois"
          >
            <Chrome className="h-4 w-4" />
            Entrar com o Google
            <ArrowRight className="h-4 w-4 opacity-80" />
          </button>

          {/* divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-500">ou</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          {/* email */}
          <label className="text-xs font-semibold text-neutral-700">E-mail</label>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 focus-within:ring-2 focus-within:ring-blue-400 transition">
            <Mail className="h-4 w-4 text-blue-700" />
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              placeholder="seuemail@email.com"
              className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>

          {/* senha */}
          <label className="mt-4 block text-xs font-semibold text-neutral-700">
            Senha
          </label>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 focus-within:ring-2 focus-within:ring-purple-400 transition">
            <Lock className="h-4 w-4 text-purple-700" />
            <input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              type="password"
              placeholder="••••••••"
              className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>

          {/* actions */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              disabled={loading}
              className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-600 active:scale-[0.99] transition disabled:opacity-60"
            >
              {loading ? "Aguarde..." : "Entrar"}
            </button>

            <button
              type="button"
              onClick={handleSignUp}
              disabled={loading}
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-60"
            >
              Criar conta
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-neutral-500">
            Ao continuar, você concorda com nossos termos e política de privacidade.
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-neutral-500">
          Dica: depois a gente vai conectar esse login ao Supabase Auth (Google + Email/Senha).
        </p>
      </div>
    </div>
  );
}
