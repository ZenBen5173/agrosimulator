"use client";

/**
 * AgroSim 2.0 — Inventory item detail.
 * Clean rewrite: item header, current stock, low-stock badge, movement history.
 * Drops the 1.0 document_items purchase chain since those tables were cut.
 */

import { use, useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Package,
  AlertTriangle,
  ArrowDownToLine,
  ArrowUpFromLine,
  Loader2,
  Sparkles,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface InventoryItem {
  id: string;
  item_name: string;
  item_type: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
  reorder_quantity: number | null;
  last_purchase_price_rm: number | null;
  supplier_name: string | null;
  created_at: string;
  updated_at: string;
}

interface Movement {
  id: string;
  movement_type: "purchase" | "usage" | "adjustment" | "wastage";
  quantity: number;
  unit: string;
  notes: string | null;
  created_at: string;
}

const TYPE_LABEL: Record<string, string> = {
  fertilizer: "Fertiliser",
  pesticide: "Pesticide",
  seed: "Seed",
  tool: "Tool",
  other: "Other",
};

const MOVEMENT_LABEL: Record<string, string> = {
  purchase: "Bought",
  usage: "Used",
  adjustment: "Adjusted",
  wastage: "Wasted",
};

export default function InventoryDetailPage(props: {
  params: Promise<{ id: string }>;
}) {
  const router = useRouter();
  const { id } = use(props.params);

  const [item, setItem] = useState<InventoryItem | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const supabase = createClient();

    const { data: itemData } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("id", id)
      .single();
    if (itemData) setItem(itemData);

    const { data: movs } = await supabase
      .from("inventory_movements")
      .select("id, movement_type, quantity, unit, notes, created_at")
      .eq("item_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    setMovements(movs ?? []);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  const isLow =
    item?.reorder_threshold &&
    item.current_quantity <= item.reorder_threshold;

  const totalIn = movements
    .filter((m) => m.movement_type === "purchase" || m.movement_type === "adjustment")
    .reduce((s, m) => s + m.quantity, 0);
  const totalOut = movements
    .filter((m) => m.movement_type === "usage" || m.movement_type === "wastage")
    .reduce((s, m) => s + m.quantity, 0);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-stone-900">
              {item?.item_name ?? "Item"}
            </h1>
            <p className="text-[11px] leading-none text-stone-500">
              Books · Inventory item
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={20} className="animate-spin text-emerald-600" />
          </div>
        ) : !item ? (
          <p className="py-12 text-center text-sm text-stone-400">
            Item not found.
          </p>
        ) : (
          <>
            {/* Current stock */}
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] uppercase tracking-wide text-stone-400">
                    Current stock
                  </p>
                  <p
                    className={`mt-1 text-3xl font-semibold ${
                      isLow ? "text-red-600" : "text-stone-900"
                    }`}
                  >
                    {item.current_quantity} {item.unit}
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    {TYPE_LABEL[item.item_type] ?? item.item_type}
                    {item.supplier_name && ` · ${item.supplier_name}`}
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-stone-50">
                  <Package size={20} className="text-stone-500" />
                </div>
              </div>

              {isLow && (
                <div className="mt-3 flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">
                  <AlertTriangle size={14} />
                  Below reorder threshold of {item.reorder_threshold} {item.unit}
                  {item.reorder_quantity && ` — order ${item.reorder_quantity} ${item.unit}`}
                </div>
              )}

              {/* Restock this — opens a new chat-to-action thread for this
                  item. AI drafts the RFQ, code generates the PDF, farmer
                  sends to supplier, etc. */}
              <RestockButton itemId={item.id} isLow={!!isLow} />
            </section>

            {/* Mini stats */}
            <section className="grid grid-cols-3 gap-2">
              <Stat label="In" value={`${totalIn.toFixed(1)} ${item.unit}`} tone="in" />
              <Stat label="Out" value={`${totalOut.toFixed(1)} ${item.unit}`} tone="out" />
              <Stat
                label="Last price"
                value={
                  item.last_purchase_price_rm
                    ? `RM ${item.last_purchase_price_rm.toFixed(2)}`
                    : "—"
                }
              />
            </section>

            {/* Movement history */}
            <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
              <div className="border-b border-stone-100 px-4 py-3">
                <h2 className="text-sm font-semibold text-stone-800">
                  Recent movements
                </h2>
              </div>
              {movements.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-stone-400">
                  No movements yet. Receipts and treatments will appear here.
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {movements.map((m) => {
                    const isIn =
                      m.movement_type === "purchase" || m.movement_type === "adjustment";
                    return (
                      <li
                        key={m.id}
                        className="flex items-center gap-3 px-4 py-3 text-sm"
                      >
                        <span
                          className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${
                            isIn ? "bg-emerald-50" : "bg-stone-100"
                          }`}
                        >
                          {isIn ? (
                            <ArrowDownToLine
                              size={14}
                              className="text-emerald-700"
                            />
                          ) : (
                            <ArrowUpFromLine
                              size={14}
                              className="text-stone-500"
                            />
                          )}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-stone-800">
                            {MOVEMENT_LABEL[m.movement_type] ?? m.movement_type}
                          </p>
                          <p className="text-[11px] text-stone-500 truncate">
                            {m.notes ?? new Date(m.created_at).toLocaleDateString("en-MY")}
                          </p>
                        </div>
                        <span
                          className={`flex-shrink-0 text-sm font-medium ${
                            isIn ? "text-emerald-700" : "text-stone-700"
                          }`}
                        >
                          {isIn ? "+" : "−"}
                          {m.quantity} {m.unit}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "in" | "out";
}) {
  const colourCls =
    tone === "in" ? "text-emerald-700" : tone === "out" ? "text-stone-700" : "text-stone-900";
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-3">
      <p className="text-[10px] uppercase tracking-wide text-stone-400">
        {label}
      </p>
      <p className={`mt-0.5 text-sm font-semibold ${colourCls}`}>{value}</p>
    </div>
  );
}

/**
 * Manual restock trigger.
 *
 * Resolves the farmer's farm, opens (or reuses) a chat-to-action thread for
 * this inventory item, and routes the farmer to the conversation. The button
 * is visually emphasised when the item is below its reorder threshold so the
 * "right move now" is obvious.
 */
function RestockButton({ itemId, isLow }: { itemId: string; isLow: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function open() {
    setBusy(true);
    setError(null);
    try {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.push("/auth/login");
        return;
      }
      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!farm) {
        setError("No farm found — set one up first.");
        return;
      }

      const res = await fetch("/api/restock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          step: "create",
          farmId: farm.id,
          inventoryItemId: itemId,
          triggerKind: "manual",
        }),
      });
      const data = await res.json();
      if (!res.ok || !data?.restock?.id) {
        setError(data?.error ?? "Could not open restock chat.");
        return;
      }
      router.push(`/chats/${data.restock.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setBusy(false);
    }
  }

  const baseCls =
    "mt-3 flex w-full items-center justify-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors disabled:opacity-60";
  const toneCls = isLow
    ? "bg-emerald-600 text-white hover:bg-emerald-700"
    : "border border-stone-300 bg-white text-stone-700 hover:border-emerald-400 hover:text-emerald-700";

  return (
    <>
      <button
        type="button"
        onClick={open}
        disabled={busy}
        className={`${baseCls} ${toneCls}`}
      >
        {busy ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Sparkles size={14} />
        )}
        {busy
          ? "Opening restock chat…"
          : isLow
            ? "Restock this — AI drafts RFQ"
            : "Restock this"}
      </button>
      {error && (
        <p className="mt-2 text-center text-xs text-red-600">{error}</p>
      )}
    </>
  );
}
