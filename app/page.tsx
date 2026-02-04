"use client";

import { useEffect, useState } from "react";
import { Mail, Lock, Chrome, ArrowRight, Sparkles } from "lucide-react";
import { supabase } from "./lib/supabase/client";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // ✅ Logs para validar ENV e sessão
  useEffect(() => {
    console.log("ENV URL:", process.env.NEXT_PUBLIC_SUPABASE_URL);
    console.log(
      "ENV KEY START:",
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.slice(0, 25)
    );

    supabase.auth.getSession().then(({ data, error }) => {
      console.log("SESSION:", data?.session ? "OK" : "NO");
      if (error) console.log("SESSION ERROR:", error.message);
    });
  }, []);

  async function handleSignUp() {
    if (!email || !password) return alert("Preencha email e senha.");
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) return alert(error.message);
    alert("Conta criada! Agora clique em Entrar.");
  }

  async function handleSignIn() {
    if (!email || !password) return alert("Preencha email e senha.");
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) return alert(error.message);
    window.location.href = "/dashboard";
  }

  async function handleGoogle() {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: {
        redirectTo: `${window.location.origin}/dashboard`,
      },
    });
    if (error) alert(error.message);
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
        </div>

        {/* card */}
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <h1 className="text-2xl font-bold text-neutral-900">Entrar</h1>
          <p className="mt-1 text-sm text-neutral-600">
            Acesse com Google ou com email e senha.
          </p>

          {/* google */}
          <button
            type="button"
            onClick={handleGoogle}
            className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
          >
            <Chrome className="h-4 w-4" />
            Entrar com Google
            <ArrowRight className="h-4 w-4 opacity-80" />
          </button>

          {/* divider */}
          <div className="my-5 flex items-center gap-3">
            <div className="h-px flex-1 bg-neutral-200" />
            <span className="text-xs text-neutral-500">ou</span>
            <div className="h-px flex-1 bg-neutral-200" />
          </div>

          {/* email */}
          <label className="text-xs font-semibold text-neutral-700">Email</label>
          <div className="mt-2 flex items-center gap-2 rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-3 focus-within:ring-2 focus-within:ring-blue-400 transition">
            <Mail className="h-4 w-4 text-blue-700" />
            <input
              type="email"
              placeholder="seuemail@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
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
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400"
            />
          </div>

          {/* actions */}
          <div className="mt-6 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={handleSignIn}
              className="rounded-xl bg-blue-700 px-4 py-3 text-sm font-semibold text-white shadow hover:bg-blue-600 active:scale-[0.99] transition"
            >
              Entrar
            </button>

            <button
              type="button"
              onClick={handleSignUp}
              className="rounded-xl bg-white px-4 py-3 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
            >
              Criar conta
            </button>
          </div>

          <p className="mt-5 text-center text-xs text-neutral-500">
            Ao continuar, você concorda com nossos termos e política de
            privacidade.
          </p>
        </div>

        <p className="mt-5 text-center text-xs text-neutral-500">
          Dica: depois a gente vai conectar esse login ao Supabase Auth (Google +
          Email/Senha).
        </p>
      </div>
    </div>
  );
}
