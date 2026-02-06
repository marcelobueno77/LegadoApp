"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  Shield,
  ShoppingBag,
  Plus,
  Minus,
  Trash2,
  ClipboardCheck,
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

type CartItem = {
  id: string;
  name: string;
  price_cents: number;
  qty: number;
};

const BUCKET = "product-images";

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function getPublicUrl(path: string | null) {
  if (!path) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl ?? null;
}

export default function ProdutosPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [products, setProducts] = useState<ProductRow[]>([]);
  const [cart, setCart] = useState<Record<string, CartItem>>({});
  const [submitting, setSubmitting] = useState(false);

  const isAdmin = role === "admin";

  useEffect(() => {
    let alive = true;

    async function load() {
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

      const { data: prof } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", u.id)
        .single();

      const r = (prof?.role ?? "member") as Role;
      setRole(r);

      const { data, error } = await supabase
        .from("products")
        .select("id, name, description, price_cents, image_path, is_active, created_at")
        .eq("is_active", true)
        .order("created_at", { ascending: false });

      if (!alive) return;

      if (error) {
        setMsg(error.message);
        setProducts([]);
      } else {
        setProducts((data ?? []) as ProductRow[]);
      }

      setLoading(false);
    }

    load();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [router]);

  const totalProducts = useMemo(() => products.length, [products]);

  const cartItems = useMemo(() => Object.values(cart), [cart]);

  const cartCount = useMemo(
    () => cartItems.reduce((acc, it) => acc + it.qty, 0),
    [cartItems]
  );

  const cartTotalCents = useMemo(
    () => cartItems.reduce((acc, it) => acc + it.qty * it.price_cents, 0),
    [cartItems]
  );

  function addToCart(p: ProductRow) {
    setMsg("");
    setCart((prev) => {
      const current = prev[p.id];
      const nextQty = (current?.qty ?? 0) + 1;
      return {
        ...prev,
        [p.id]: {
          id: p.id,
          name: p.name,
          price_cents: p.price_cents,
          qty: nextQty,
        },
      };
    });
  }

  function inc(id: string) {
    setMsg("");
    setCart((prev) => {
      const it = prev[id];
      if (!it) return prev;
      return { ...prev, [id]: { ...it, qty: it.qty + 1 } };
    });
  }

  function dec(id: string) {
    setMsg("");
    setCart((prev) => {
      const it = prev[id];
      if (!it) return prev;
      const nextQty = it.qty - 1;
      if (nextQty <= 0) {
        const copy = { ...prev };
        delete copy[id];
        return copy;
      }
      return { ...prev, [id]: { ...it, qty: nextQty } };
    });
  }

  function removeFromCart(id: string) {
    setMsg("");
    setCart((prev) => {
      const copy = { ...prev };
      delete copy[id];
      return copy;
    });
  }

  function clearCart() {
    setCart({});
  }

  async function submitOrder() {
    setMsg("");
    if (!cartItems.length) {
      setMsg("Selecione pelo menos 1 produto para encomendar.");
      return;
    }

    setSubmitting(true);

    const { data: sess } = await supabase.auth.getSession();
    const u = sess.session?.user ?? null;

    if (!u) {
      setMsg("Faça login para encomendar.");
      setSubmitting(false);
      return;
    }

    // pega dados do profile pra salvar junto no pedido (facilita pro admin)
    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("full_name, phone")
      .eq("id", u.id)
      .single();

    if (profErr) {
      setMsg(`Erro ao carregar perfil: ${profErr.message}`);
      setSubmitting(false);
      return;
    }

    // 1) cria pedido
    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        user_id: u.id,
        full_name: prof?.full_name ?? null,
        phone: prof?.phone ?? null,
        status: "pending",
      })
      .select("id")
      .single();

    if (orderErr || !order?.id) {
      setMsg(`Erro ao criar pedido: ${orderErr?.message ?? "Sem ID"}`);
      setSubmitting(false);
      return;
    }

    // 2) cria itens do pedido
    const itemsPayload = cartItems.map((it) => ({
      order_id: order.id,
      product_id: it.id,
      product_name: it.name,
      price_cents: it.price_cents,
      qty: it.qty,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);

    if (itemsErr) {
      setMsg(`Erro ao salvar itens: ${itemsErr.message}`);
      setSubmitting(false);
      return;
    }

    setMsg(
      "✅ Obrigado pelo seu pedido! Logo entraremos em contato via whatzap (confere se seu contato esta certo no cadastro de membros)."
    );

    clearCart();
    setSubmitting(false);
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando produtos…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-6xl">
        {/* header */}
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Produtos</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Catálogo do Legado — escolha itens para encomendar.
            </p>
            <p className="mt-1 text-xs text-neutral-500">Total: {totalProducts}</p>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">{user?.email}</div>
            <div className="mt-1 text-xs text-neutral-500">
              Perfil: <span className="font-semibold text-neutral-700">{role}</span>
            </div>

            <div className="mt-3 flex items-center justify-end gap-2">
              {isAdmin ? (
                <>
                  <button
                    onClick={() => router.push("/produtos/pedidos")}
                    className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
                  >
                    <ClipboardCheck className="h-4 w-4" />
                    Pedidos
                  </button>

                  <button
                    onClick={() => router.push("/produtos/admin")}
                    className="inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
                  >
                    <Shield className="h-4 w-4" />
                    Admin
                  </button>
                </>
              ) : null}

              <button
                onClick={() => router.push("/dashboard")}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <ArrowLeft className="h-4 w-4" />
                Voltar
              </button>
            </div>
          </div>
        </div>

        {msg ? (
          <div className="mt-6 rounded-xl border border-neutral-200 bg-neutral-50 px-4 py-3 text-sm text-neutral-800">
            {msg}
          </div>
        ) : null}

        {/* carrinho */}
        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-neutral-900">
                Selecionados: <span className="font-bold">{cartCount}</span>
              </div>
              <div className="text-xs text-neutral-500">
                Total: <span className="font-semibold">R$ {moneyFromCents(cartTotalCents)}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 sm:items-center sm:justify-end">
              <button
                type="button"
                onClick={clearCart}
                disabled={!cartItems.length || submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
                Limpar seleção
              </button>

              <button
                type="button"
                onClick={submitOrder}
                disabled={!cartItems.length || submitting}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
              >
                <ShoppingBag className="h-4 w-4" />
                {submitting ? "Enviando..." : "Encomendar"}
              </button>
            </div>
          </div>

          {cartItems.length ? (
            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              {cartItems.map((it) => (
                <div
                  key={it.id}
                  className="rounded-xl ring-1 ring-neutral-200 bg-white px-4 py-3 flex items-center justify-between gap-3"
                >
                  <div className="min-w-0">
                    <div className="text-sm font-semibold text-neutral-900 truncate">{it.name}</div>
                    <div className="text-xs text-neutral-500">
                      R$ {moneyFromCents(it.price_cents)} • Subtotal:{" "}
                      <span className="font-semibold">
                        R$ {moneyFromCents(it.price_cents * it.qty)}
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => dec(it.id)}
                      className="inline-flex items-center justify-center rounded-xl bg-white shadow ring-1 ring-neutral-200 w-10 h-10 hover:bg-neutral-50 active:scale-[0.99] transition"
                      title="Diminuir"
                    >
                      <Minus className="h-4 w-4" />
                    </button>

                    <div className="w-10 text-center text-sm font-bold">{it.qty}</div>

                    <button
                      type="button"
                      onClick={() => inc(it.id)}
                      className="inline-flex items-center justify-center rounded-xl bg-white shadow ring-1 ring-neutral-200 w-10 h-10 hover:bg-neutral-50 active:scale-[0.99] transition"
                      title="Aumentar"
                    >
                      <Plus className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => removeFromCart(it.id)}
                      className="inline-flex items-center justify-center rounded-xl bg-white shadow ring-1 ring-neutral-200 w-10 h-10 hover:bg-neutral-50 active:scale-[0.99] transition"
                      title="Remover"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 text-sm text-neutral-500">
              Nenhum produto selecionado ainda. Clique em <b>Selecionar</b> nos cards abaixo.
            </div>
          )}
        </div>

        {/* catálogo */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {products.map((p) => {
            const img = getPublicUrl(p.image_path);
            const selectedQty = cart[p.id]?.qty ?? 0;

            return (
              <div
                key={p.id}
                className="rounded-2xl bg-white shadow-md ring-1 ring-neutral-200 overflow-hidden"
              >
                {img ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={img} alt={p.name} className="w-full h-44 object-cover" />
                ) : (
                  <div className="w-full h-44 bg-neutral-50 flex items-center justify-center text-sm text-neutral-500">
                    Sem imagem
                  </div>
                )}

                <div className="p-5">
                  <div className="flex items-center justify-between gap-3">
                    <h2 className="font-bold text-neutral-900 truncate">{p.name}</h2>
                    <div className="text-sm font-semibold text-neutral-900">
                      R$ {moneyFromCents(p.price_cents)}
                    </div>
                  </div>

                  {p.description ? (
                    <p className="mt-2 text-sm text-neutral-700 line-clamp-3">{p.description}</p>
                  ) : (
                    <p className="mt-2 text-sm text-neutral-500">Sem descrição</p>
                  )}

                  <button
                    onClick={() => addToCart(p)}
                    className="mt-4 w-full inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition"
                  >
                    <ShoppingBag className="h-4 w-4" />
                    {selectedQty ? `Selecionado (${selectedQty})` : "Selecionar"}
                  </button>
                </div>
              </div>
            );
          })}

          {!products.length ? (
            <div className="sm:col-span-2 lg:col-span-3 rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-sm text-neutral-600">
              Nenhum produto ativo no catálogo.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
