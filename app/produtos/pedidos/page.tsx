"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import {
  ArrowLeft,
  ShieldAlert,
  ClipboardCheck,
  CheckCircle2,
  Trash2,
  RefreshCw,
} from "lucide-react";

type Role = "member" | "leader" | "director" | "admin";

type OrderRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  status: "pending" | "finished" | string;
  created_at: string;
};

type OrderItemRow = {
  id?: string;
  order_id: string;
  product_id: string | null;
  product_name: string;
  qty: number;
  unit_price_cents: number;
};

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDateBR(iso: string) {
  try {
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** ✅ limpa telefone pra link do WhatsApp (mantém só números; se não tiver DDI, coloca 55) */
function phoneToWhatsAppLink(phoneRaw: string | null | undefined, message?: string) {
  const raw = (phoneRaw ?? "").trim();
  if (!raw) return null;

  let digits = raw.replace(/\D/g, "");

  // remove 00 no começo
  if (digits.startsWith("00")) digits = digits.slice(2);

  // se vier sem DDI e parecer BR (10 ou 11 dígitos), adiciona 55
  if (!digits.startsWith("55")) {
    if (digits.length === 10 || digits.length === 11) digits = "55" + digits;
  }

  if (digits.length < 10) return null;

  const base = `https://wa.me/${digits}`;
  if (message && message.trim()) {
    const text = encodeURIComponent(message.trim());
    return `${base}?text=${text}`;
  }
  return base;
}

export default function ProdutosPedidosPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [myRole, setMyRole] = useState<Role | null>(null);

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [msg, setMsg] = useState("");

  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemsByOrderId, setItemsByOrderId] = useState<Record<string, OrderItemRow[]>>({});

  const [workingId, setWorkingId] = useState<string | null>(null);

  const isAdmin = myRole === "admin";

  // ✅ evita boot duplicado no dev (Strict Mode)
  const ranRef = useRef(false);

  async function loadAll(opts?: { silent?: boolean }) {
    if (!opts?.silent) setMsg("");
    setRefreshing(true);

    try {
      // 1) puxa pedidos pendentes
      const { data: ordersData, error: ordersErr } = await supabase
        .from("orders")
        .select("id, user_id, full_name, phone, status, created_at")
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (ordersErr) {
        setOrders([]);
        setItemsByOrderId({});
        setMsg(ordersErr.message);
        return;
      }

      const list = (ordersData ?? []) as OrderRow[];
      setOrders(list);

      // 2) puxa itens desses pedidos
      if (!list.length) {
        setItemsByOrderId({});
        return;
      }

      const orderIds = list.map((o) => o.id);

      const { data: itemsData, error: itemsErr } = await supabase
        .from("order_items")
        .select("id, order_id, product_id, product_name, qty, unit_price_cents")
        .in("order_id", orderIds)
        .order("product_name", { ascending: true });

      if (itemsErr) {
        setItemsByOrderId({});
        setMsg(`Pedidos carregados, mas erro ao carregar itens: ${itemsErr.message}`);
        return;
      }

      const items = (itemsData ?? []) as OrderItemRow[];
      const grouped: Record<string, OrderItemRow[]> = {};
      for (const it of items) {
        grouped[it.order_id] = grouped[it.order_id] ?? [];
        grouped[it.order_id].push(it);
      }
      setItemsByOrderId(grouped);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    if (ranRef.current) return;
    ranRef.current = true;

    let alive = true;

    async function boot() {
      setLoading(true);
      setMsg("");

      const { data: sess, error: sessErr } = await supabase.auth.getSession();
      const u = sess.session?.user ?? null;

      if (sessErr) {
        if (!alive) return;
        setMsg(sessErr.message);
        setLoading(false);
        return;
      }

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

      const role = (me?.role ?? "member") as Role;
      setMyRole(role);

      if (role !== "admin") {
        setLoading(false);
        return;
      }

      await loadAll({ silent: true });
      if (!alive) return;
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

  const totalPending = useMemo(() => orders.length, [orders]);

  function calcOrderTotalCents(orderId: string) {
    const items = itemsByOrderId[orderId] ?? [];
    return items.reduce((acc, it) => acc + it.qty * it.unit_price_cents, 0);
  }

  async function finalizeOrder(orderId: string) {
    setMsg("");
    setWorkingId(orderId);

    try {
      const { error } = await supabase
        .from("orders")
        .update({ status: "finished" })
        .eq("id", orderId);

      if (error) throw new Error(error.message);

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setItemsByOrderId((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });

      setMsg("✅ Pedido finalizado!");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao finalizar pedido.");
    } finally {
      setWorkingId(null);
    }
  }

  async function deleteOrder(orderId: string) {
    setMsg("");
    setWorkingId(orderId);

    const ok = confirm("Tem certeza que deseja EXCLUIR este pedido? Essa ação não pode ser desfeita.");
    if (!ok) {
      setWorkingId(null);
      return;
    }

    try {
      const { error: delItemsErr } = await supabase
        .from("order_items")
        .delete()
        .eq("order_id", orderId);

      if (delItemsErr) throw new Error(`Erro ao excluir itens: ${delItemsErr.message}`);

      const { error: delOrderErr } = await supabase
        .from("orders")
        .delete()
        .eq("id", orderId);

      if (delOrderErr) throw new Error(`Erro ao excluir pedido: ${delOrderErr.message}`);

      setOrders((prev) => prev.filter((o) => o.id !== orderId));
      setItemsByOrderId((prev) => {
        const copy = { ...prev };
        delete copy[orderId];
        return copy;
      });

      setMsg("🗑️ Pedido excluído!");
    } catch (e: any) {
      setMsg(e?.message ?? "Erro ao excluir pedido.");
    } finally {
      setWorkingId(null);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-6">
        <div className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 px-6 py-4">
          <p className="text-sm font-medium text-neutral-700">Carregando pedidos…</p>
        </div>
      </div>
    );
  }

  // não-admin
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
                Somente administradores podem ver pedidos.
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

  // admin
  return (
    <div className="min-h-screen bg-white text-neutral-900 p-6">
      <div className="mx-auto w-full max-w-6xl">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Pedidos — Pendentes</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Aqui aparecem somente pedidos com status <b>pending</b>.
            </p>
            <p className="mt-1 text-xs text-neutral-500">Total pendentes: {totalPending}</p>
          </div>

          <div className="text-right">
            <div className="text-xs text-neutral-500">Logado como</div>
            <div className="text-sm font-semibold truncate max-w-[260px]">{user?.email}</div>

            <div className="mt-3 flex items-center justify-end gap-2">
              <button
                onClick={() => loadAll()}
                disabled={refreshing}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
                {refreshing ? "Atualizando..." : "Atualizar"}
              </button>

              <button
                onClick={() => router.push("/produtos")}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <ClipboardCheck className="h-4 w-4" />
                Produtos
              </button>

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

        <div className="mt-6 grid grid-cols-1 gap-4">
          {orders.map((o) => {
            const items = itemsByOrderId[o.id] ?? [];
            const totalCents = calcOrderTotalCents(o.id);

            const itemsSummaryInline = items.length
              ? items.map((it) => `${it.qty}x ${it.product_name}`).join(" / ")
              : "(Sem itens)";

            const itemsTextList = items.length
              ? items.map((it) => `• ${it.qty}x ${it.product_name}`).join("\n")
              : "• (Sem itens)";

            const name = (o.full_name ?? "Tudo certo!").trim();

            const message = `Oi ${name}! Aqui é do Legado MC 😊

Vi seu pedido pendente no sistema.
Pedido: ${o.id}

🛒 Itens do pedido:
${itemsTextList}

Vamos dar sequência do seu pedido por aqui, tudo bem?`;

            const waLink = phoneToWhatsAppLink(o.phone, message);

            return (
              <div
                key={o.id}
                className="rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-5"
              >
                <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                  <div className="min-w-0">
                    <div className="text-lg font-bold text-neutral-900 truncate">
                      {o.full_name ?? "Sem nome"}
                    </div>

                    <div className="mt-1 text-sm text-neutral-700">
                      📞{" "}
                      {waLink ? (
                        <a
                          href={waLink}
                          target="_blank"
                          rel="noreferrer"
                          className="text-green-700 font-semibold hover:underline"
                          title="Abrir no WhatsApp"
                        >
                          {o.phone}
                        </a>
                      ) : (
                        <span className="text-neutral-700">{o.phone ?? "Sem telefone"}</span>
                      )}
                    </div>

                    <div className="mt-1 text-sm text-neutral-700 truncate">🛒 {itemsSummaryInline}</div>

                    <div className="mt-1 text-xs text-neutral-500">
                      🗓️ {formatDateBR(o.created_at)} • Pedido: {o.id}
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-2 md:justify-end">
                    <button
                      onClick={() => finalizeOrder(o.id)}
                      disabled={workingId === o.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-4 py-2.5 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {workingId === o.id ? "Processando..." : "Finalizar pedido"}
                    </button>

                    <button
                      onClick={() => deleteOrder(o.id)}
                      disabled={workingId === o.id}
                      className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-semibold text-red-600 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition disabled:opacity-60"
                    >
                      <Trash2 className="h-4 w-4" />
                      Excluir
                    </button>
                  </div>
                </div>

                <div className="mt-4 rounded-xl ring-1 ring-neutral-200 overflow-hidden">
                  <div className="bg-neutral-50 px-4 py-2 text-sm font-semibold text-neutral-800 flex items-center justify-between">
                    <span>Itens</span>
                    <span>Total: R$ {moneyFromCents(totalCents)}</span>
                  </div>

                  {items.length ? (
                    <div className="divide-y divide-neutral-200">
                      {items.map((it, idx) => (
                        <div key={it.id ?? `${it.order_id}-${idx}`} className="px-4 py-3">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-neutral-900 truncate">
                                {it.product_name}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Qtd: <b>{it.qty}</b> • Unit: R$ {moneyFromCents(it.unit_price_cents)} •
                                Subtotal:{" "}
                                <b>R$ {moneyFromCents(it.unit_price_cents * it.qty)}</b>
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="px-4 py-4 text-sm text-neutral-600">
                      Nenhum item encontrado para este pedido.
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {!orders.length ? (
            <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-sm text-neutral-600">
              Nenhum pedido pendente no momento ✅
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
