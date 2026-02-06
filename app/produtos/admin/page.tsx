"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  Plus,
  Save,
  Trash2,
  Pencil,
  X,
  Image as ImageIcon,
  ShieldAlert,
} from "lucide-react";

type Role = "member" | "leader" | "admin";

type ProductRow = {
  id: string;
  name: string;
  description: string | null;
  price_cents: number;
  image_path: string | null;
  is_active: boolean;
  created_at: string;
};

const BUCKET = "product-images";

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function centsFromMoneyBR(raw: string) {
  // aceita "12,90" ou "12.90" ou "12"
  const v = (raw ?? "").trim().replace(/\./g, "").replace(",", ".");
  const n = Number(v);
  if (Number.isNaN(n) || n < 0) return 0;
  return Math.round(n * 100);
}

function extFromFileName(name: string) {
  const idx = name.lastIndexOf(".");
  if (idx === -1) return "";
  return name.slice(idx + 1).toLowerCase();
}

function getPublicUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export default function ProdutosAdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // form (create/edit)
  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priceText, setPriceText] = useState("0,00");
  const [isActive, setIsActive] = useState(true);
  const [file, setFile] = useState<File | null>(null);

  const isAdmin = myRole === "admin";

  function resetForm() {
    setEditing(null);
    setName("");
    setDescription("");
    setPriceText("0,00");
    setIsActive(true);
    setFile(null);
  }

  function fillForm(p: ProductRow) {
    setEditing(p);
    setName(p.name ?? "");
    setDescription(p.description ?? "");
    setPriceText(moneyFromCents(p.price_cents ?? 0));
    setIsActive(!!p.is_active);
    setFile(null);
  }

  async function loadProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("id, name, description, price_cents, image_path, is_active, created_at")
      .order("created_at", { ascending: false });

    if (error) {
      setMsg(error.message);
      setProducts([]);
      return;
    }
    setProducts((data ?? []) as ProductRow[]);
  }

  useEffect(() => {
    let alive = true;

    async function boot() {
      setLoading(true);
      setMsg("");

      const { data: sess } = await supabase.auth.getSession();
      const u = sess.session?.user ?? null;

      if (!u) {
        router.replace("/login");
        return;
      }
      if (!alive) return;
      setUser(u);

      const { data: me, error: meErr } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      if (!alive) return;

      if (meErr) {
        setMsg(meErr.message);
        setLoading(false);
        return;
      }

      const r = (me?.role ?? "member") as Role;
      setMyRole(r);

      if (r !== "admin") {
        setLoading(false);
        return;
      }

      await loadProducts();
      setLoading(false);
    }

    boot();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  async function uploadImage(productId: string, f: File) {
    const ext = extFromFileName(f.name) || "jpg";
    const path = `products/${productId}-${Date.now()}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(path, f, {
      cacheControl: "3600",
      upsert: false,
    });

    if (error) throw new Error(error.message);
    return path;
  }

  async function deleteImage(path: string) {
    // storage remove aceita array
    await supabase.storage.from(BUCKET).remove([path]);
  }

  async function onSave() {
    setMsg("");
    setSaving(true);

    try {
      const price_cents = centsFromMoneyBR(priceText);

      if (!name.trim()) {
        setMsg("Informe o nome do produto.");
        setSaving(false);
        return;
      }

      // CREATE
      if (!editing) {
        // 1) cria produto sem imagem primeiro (pra ter ID)
        const { data: created, error: createErr } = await supabase
          .from("products")
          .insert({
            name: name.trim(),
            description: description.trim() || null,
            price_cents,
            is_active: isActive,
          })
          .select("id")
          .single();

        if (createErr) throw new Error(createErr.message);

        let image_path: string | null = null;

        // 2) upload imagem (se tiver)
        if (file) {
          image_path = await uploadImage(created.id, file);

          const { error: updErr } = await supabase
            .from("products")
            .update({ image_path })
            .eq("id", created.id);

          if (updErr) throw new Error(updErr.message);
        }

        await loadProducts();
        resetForm();
        setMsg("✅ Produto cadastrado!");
        setSaving(false);
        return;
      }

      // UPDATE
      let newImagePath: string | null = editing.image_path ?? null;

      // se trocar imagem, faz upload e remove a antiga
      if (file) {
        const uploaded = await uploadImage(editing.id, file);
        const old = editing.image_path;

        newImagePath = uploaded;

        const { error: updImgErr } = await supabase
          .from("products")
          .update({ image_path: newImagePath })
          .eq("id", editing.id);

        if (updImgErr) throw new Error(updImgErr.message);

        if (old) {
          // tenta remover a antiga (não trava se falhar)
          try {
            await deleteImage(old);
          } catch {}
        }
      }

      const { error: updErr } = await supabase
        .from("products")
        .update({
          name: name.trim(),
          description: description.trim() || null,
          price_cents,
          is_active: isActive,
          // image_path já foi atualizado acima se necessário
        })
        .eq("id", editing.id);

      if (updErr) throw new Error(updErr.message);

      await loadProducts();
      resetForm();
      setMsg("✅ Produto atualizado!");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao salvar.");
    } finally {
      setSaving(false);
    }
  }

  async function onDelete(p: ProductRow) {
    setMsg("");
    setDeletingId(p.id);

    try {
      // 1) deleta registro
      const { error } = await supabase.from("products").delete().eq("id", p.id);
      if (error) throw new Error(error.message);

      // 2) deleta imagem do storage (se tiver)
      if (p.image_path) {
        try {
          await deleteImage(p.image_path);
        } catch {}
      }

      await loadProducts();
      if (editing?.id === p.id) resetForm();
      setMsg("🗑️ Produto removido!");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao deletar.");
    } finally {
      setDeletingId(null);
    }
  }

  const previewUrl = useMemo(() => {
    if (file) return URL.createObjectURL(file);
    if (editing?.image_path) return getPublicUrl(editing.image_path);
    return null;
  }, [file, editing]);

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando produtos…</p>
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-white text-neutral-900 p-6">
        <div className="mx-auto w-full max-w-2xl rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-neutral-900 text-white flex items-center justify-center">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <h1 className="text-xl font-bold">Acesso restrito</h1>
              <p className="mt-1 text-sm text-neutral-600">
                Somente administradores podem cadastrar/editar produtos.
              </p>

              <button
                type="button"
                onClick={() => router.replace("/produtos")}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Produtos — Admin</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Cadastre, edite e gerencie o catálogo.
            </p>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">{user?.email}</div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => router.push("/produtos")}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Catálogo
              </button>

              <button
                onClick={resetForm}
                className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
              >
                <Plus className="h-4 w-4" />
                Novo
              </button>
            </div>
          </div>
        </div>

        {msg ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* FORM */}
          <div className="lg:col-span-1 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold">
                {editing ? "Editar produto" : "Cadastrar produto"}
              </h2>
              {editing ? (
                <button
                  onClick={resetForm}
                  className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
                >
                  <X className="h-4 w-4" />
                  Cancelar
                </button>
              ) : null}
            </div>

            <label className="mt-4 block text-sm font-semibold text-neutral-700">Nome</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Camiseta Legado"
              className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
            />

            <label className="mt-4 block text-sm font-semibold text-neutral-700">Descrição</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Detalhes do produto…"
              rows={4}
              className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
            />

            <label className="mt-4 block text-sm font-semibold text-neutral-700">Valor (R$)</label>
            <input
              value={priceText}
              onChange={(e) => setPriceText(e.target.value)}
              placeholder="Ex: 79,90"
              className="mt-2 w-full rounded-xl bg-white shadow-sm ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
            />
            <p className="mt-1 text-xs text-neutral-500">Aceita 79,90 ou 79.90</p>

            <label className="mt-4 block text-sm font-semibold text-neutral-700">
              Imagem do produto
            </label>
            <div className="mt-2 flex items-center gap-3">
              <label className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 transition cursor-pointer">
                <ImageIcon className="h-4 w-4" />
                {file ? "Trocar imagem" : "Selecionar imagem"}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                />
              </label>

              {file ? (
                <button
                  onClick={() => setFile(null)}
                  className="text-sm font-semibold text-neutral-600 hover:text-neutral-900"
                >
                  Remover
                </button>
              ) : null}
            </div>

            {previewUrl ? (
              <div className="mt-4 rounded-2xl overflow-hidden ring-1 ring-neutral-200">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={previewUrl} alt="Preview" className="w-full h-48 object-cover" />
              </div>
            ) : (
              <div className="mt-4 rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-sm text-neutral-600">
                Sem imagem selecionada.
              </div>
            )}

            <div className="mt-4 flex items-center gap-2">
              <input
                id="isActive"
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4"
              />
              <label htmlFor="isActive" className="text-sm font-semibold text-neutral-700">
                Ativo no catálogo
              </label>
            </div>

            <button
              onClick={onSave}
              disabled={saving}
              className="mt-5 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
            >
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : editing ? "Salvar alterações" : "Cadastrar"}
            </button>

            {editing ? (
              <button
                onClick={() => onDelete(editing)}
                disabled={deletingId === editing.id}
                className="mt-3 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-60"
              >
                <Trash2 className="h-4 w-4" />
                {deletingId === editing.id ? "Deletando..." : "Deletar produto"}
              </button>
            ) : null}
          </div>

          {/* LIST */}
          <div className="lg:col-span-2 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
            <h2 className="text-lg font-bold">Lista de produtos</h2>

            <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {products.map((p) => {
                const img = getPublicUrl(p.image_path);
                return (
                  <div key={p.id} className="rounded-2xl ring-1 ring-neutral-200 overflow-hidden">
                    {img ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={img} alt={p.name} className="w-full h-40 object-cover" />
                    ) : (
                      <div className="w-full h-40 bg-neutral-50 flex items-center justify-center text-sm text-neutral-500">
                        Sem imagem
                      </div>
                    )}

                    <div className="p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-bold text-neutral-900 truncate">{p.name}</div>
                          <div className="text-xs text-neutral-500">
                            R$ {moneyFromCents(p.price_cents)} •{" "}
                            {p.is_active ? "Ativo" : "Inativo"}
                          </div>
                        </div>

                        <button
                          onClick={() => fillForm(p)}
                          className="inline-flex items-center gap-2 rounded-xl bg-white px-3 py-2 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 transition"
                        >
                          <Pencil className="h-4 w-4" />
                          Editar
                        </button>
                      </div>

                      {p.description ? (
                        <p className="mt-3 text-sm text-neutral-700 line-clamp-3">
                          {p.description}
                        </p>
                      ) : (
                        <p className="mt-3 text-sm text-neutral-500">Sem descrição</p>
                      )}

                      <button
                        onClick={() => onDelete(p)}
                        disabled={deletingId === p.id}
                        className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-red-600 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 transition disabled:opacity-60"
                      >
                        <Trash2 className="h-4 w-4" />
                        {deletingId === p.id ? "Deletando..." : "Deletar"}
                      </button>
                    </div>
                  </div>
                );
              })}

              {!products.length ? (
                <div className="sm:col-span-2 rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-sm text-neutral-600">
                  Nenhum produto cadastrado ainda.
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
