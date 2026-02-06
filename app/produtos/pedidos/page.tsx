"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/app/lib/supabase/client";
import { ArrowLeft, ShieldAlert, CheckCircle2, RefreshCw } from "lucide-react";

type Role = "member" | "leader" | "admin";

type OrderRow = {
  id: string;
  user_id: string;
  full_name: string | null;
  phone: string | null;
  status: "pending" | "done";
  created_at: string;
};

type OrderItemRow = {
  id: string;
  order_id: string;
  product_id: string;
  product_name: string;
  price_cents: number;
  qty: number;
};

function moneyFromCents(cents: number) {
  return (cents / 100).toFixed(2).replace(".", ",");
}

function formatDate(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pt-BR");
}

export default function PedidosAdminPage() {
  const router = useRouter();

  const [user, setUser] = useState<User | null>(null);
  const [myRole, setMyRole] = useState<Role>("member");

  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState("");

  const [statusFilter, setStatusFilter] = useState<"pending" | "done">("pending");
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [itemsByOrder, setItemsByOrder] = useState<Record<string, OrderItemRow[]>>({});
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const isAdmin = myRole === "admin";

  async function loadOrders() {
    setMsg("");
    setLoading(true);

    const { data: sess } = await supabase.auth.getSession();
    const u = sess.session?.user ?? null;

    if (!u) {
      router.replace("/login");
      return;
    }
    setUser(u);

    const { data: prof, error: profErr } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", u.id)
      .single();

    if (profErr) {
      setMsg(profErr.message);
      setLoading(false);
      return;
    }

    const r = (prof?.role ?? "member") as Role;
    setMyRole(r);

    if (r !== "admin") {
      setLoading(false);
      return;
    }

    const { data: ord, error: ordErr } = await supabase
      .from("orders")
      .select("id, user_id, full_name, phone, status, created_at")
      .eq("status", statusFilter)
      .order("created_at", { ascending: false })
      .limit(300);

    if (ordErr) {
      setMsg(ordErr.message);
      setOrders([]);
      setItemsByOrder({});
      setLoading(false);
      return;
    }

    const list = (ord ?? []) as OrderRow[];
    setOrders(list);

    // carrega itens
    const ids = list.map((o) => o.id);
    if (!ids.length) {
      setItemsByOrder({});
      setLoading(false);
      return;
    }

    const { data: its, error: itsErr } = await supabase
      .from("order_items")
      .select("id, order_id, product_id, product_name, price_cents, qty")
      .in("order_id", ids);

    if (itsErr) {
      setMsg(itsErr.message);
      setItemsByOrder({});
      setLoading(false);
      return;
    }

    const map: Record<string, OrderItemRow[]> = {};
    for (const it of (its ?? []) as OrderItemRow[]) {
      if (!map[it.order_id]) map[it.order_id] = [];
      map[it.order_id].push(it);
    }

    setItemsByOrder(map);
    setLoading(false);
  }

  useEffect(() => {
    let alive = true;

    (async () => {
      if (!alive) return;
      await loadOrders();
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      if (!s) router.replace("/login");
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, statusFilter]);

  const total = useMemo(() => orders.length, [orders]);

  const totalsByOrder = useMemo(() => {
    const res: Record<string, { items: number; total_cents: number }> = {};
    for (const o of orders) {
      const its = itemsByOrder[o.id] ?? [];
      const itemsCount = its.reduce((acc, x) => acc + x.qty, 0);
      const totalCents = its.reduce((acc, x) => acc + x.qty * x.price_cents, 0);
      res[o.id] = { items: itemsCount, total_cents: totalCents };
    }
    return res;
  }, [orders, itemsByOrder]);

  async function markDone(orderId: string) {
    setMsg("");
    setUpdatingId(orderId);

    const { error } = await supabase
      .from("orders")
      .update({ status: "done" })
      .eq("id", orderId);

    if (error) {
      setMsg(error.message);
      setUpdatingId(null);
      return;
    }

    setUpdatingId(null);
    await loadOrders(); // recarrega lista
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
                Somente administradores podem consultar pedidos.
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
            <h1 className="text-2xl font-bold">Pedidos</h1>
            <p className="mt-1 text-sm text-neutral-600">
              Consulta de pedidos do catálogo.
            </p>
            <p className="mt-1 text-xs text-neutral-500">
              Total ({statusFilter === "pending" ? "Pendentes" : "Finalizados"}): {total}
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

        <div className="mt-6 rounded-2xl bg-white shadow-xl ring-1 ring-neutral-200 p-6">
          <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as "pending" | "done")}
                className="rounded-xl bg-white shadow-md ring-1 ring-neutral-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-400 transition"
              >
                <option value="pending">Pendentes</option>
                <option value="done">Finalizados</option>
              </select>

              <button
                onClick={loadOrders}
                className="inline-flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-semibold text-neutral-900 shadow ring-1 ring-neutral-200 hover:bg-neutral-50 active:scale-[0.99] transition"
              >
                <RefreshCw className="h-4 w-4" />
                Atualizar
              </button>
            </div>

            <div className="text-xs text-neutral-500">
              Mostrando <span className="font-semibold">{orders.length}</span>
            </div>
          </div>

          <div className="mt-6 space-y-4">
            {orders.map((o) => {
              const its = itemsByOrder[o.id] ?? [];
              const totals = totalsByOrder[o.id] ?? { items: 0, total_cents: 0 };

              return (
                <div key={o.id} className="rounded-2xl ring-1 ring-neutral-200 bg-white p-5">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-bold text-neutral-900 truncate">
                        {o.full_name ?? "(Sem nome)"}{" "}
                        <span className="text-xs font-medium text-neutral-500">
                          • {formatDate(o.created_at)}
                        </span>
                      </div>
                      <div className="mt-1 text-sm text-neutral-700">
                        WhatsApp/Telefone:{" "}
                        <span className="font-semibold">{o.phone ?? "Não informado"}</span>
                      </div>
                      <div className="mt-1 text-xs text-neutral-500 truncate">
                        Pedido ID: {o.id}
                      </div>
                    </div>

                    <div className="shrink-0 text-right">
                      <div className="text-sm font-semibold text-neutral-900">
                        {totals.items} item(ns) • R$ {moneyFromCents(totals.total_cents)}
                      </div>

                      {statusFilter === "pending" ? (
                        <button
                          onClick={() => markDone(o.id)}
                          disabled={updatingId === o.id}
                          className="mt-2 inline-flex items-center gap-2 rounded-xl bg-neutral-900 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-neutral-800 active:scale-[0.99] transition disabled:opacity-60"
                        >
                          <CheckCircle2 className="h-4 w-4" />
                          {updatingId === o.id ? "Salvando..." : "Marcar como finalizado"}
                        </button>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 rounded-xl bg-neutral-50 ring-1 ring-neutral-200 overflow-hidden">
                    <div className="px-4 py-2 text-xs font-semibold text-neutral-700 border-b border-neutral-200">
                      Itens do pedido
                    </div>

                    {its.length ? (
                      <div className="divide-y divide-neutral-200">
                        {its.map((it) => (
                          <div key={it.id} className="px-4 py-3 flex items-center justify-between gap-3">
                            <div className="min-w-0">
                              <div className="text-sm font-semibold text-neutral-900 truncate">
                                {it.product_name}
                              </div>
                              <div className="text-xs text-neutral-500">
                                Qtd: {it.qty} • Unit: R$ {moneyFromCents(it.price_cents)}
                              </div>
                            </div>

                            <div className="text-sm font-semibold text-neutral-900">
                              R$ {moneyFromCents(it.qty * it.price_cents)}
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="px-4 py-4 text-sm text-neutral-600">Sem itens.</div>
                    )}
                  </div>
                </div>
              );
            })}

            {!orders.length ? (
              <div className="rounded-2xl bg-neutral-50 ring-1 ring-neutral-200 p-6 text-sm text-neutral-600">
                Nenhum pedido {statusFilter === "pending" ? "pendente" : "finalizado"}.
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
