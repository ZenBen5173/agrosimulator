"use client";

/**
 * AgroSim 2.0 — Inventory page (Books layer).
 * Card-based list, no pie charts, matches the rest of the 2.0 surfaces.
 */

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Camera,
  Plus,
  ChevronRight,
  Package,
  AlertTriangle,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";
import { createClient } from "@/lib/supabase/client";

interface InventoryItem {
  id: string;
  item_name: string;
  item_type: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
  last_purchase_price_rm: number | null;
  supplier_name: string | null;
}

const TYPE_LABEL: Record<string, string> = {
  fertilizer: "Fertiliser",
  pesticide: "Pesticide",
  seed: "Seed",
  tool: "Tool",
  other: "Other",
};

export default function InventoryPage() {
  const router = useRouter();
  const storeFarmId = useFarmStore((s) => s.farm?.id);
  const [resolvedFarmId, setResolvedFarmId] = useState<string | null>(null);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("fertilizer");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("kg");

  // Resolve farm: prefer Zustand, fall back to Supabase lookup
  useEffect(() => {
    if (storeFarmId) {
      setResolvedFarmId(storeFarmId);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) {
        setResolvedFarmId(farm.id);
      } else {
        setLoading(false);
      }
    });
  }, [storeFarmId]);

  const farmId = resolvedFarmId;

  const fetchItems = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/inventory?farm_id=${farmId}`);
      if (res.ok) setItems(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => {
    fetchItems();
  }, [fetchItems]);

  const addItem = async () => {
    if (!farmId || !newName) return;
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        farm_id: farmId,
        item_name: newName,
        item_type: newType,
        current_quantity: parseFloat(newQty) || 0,
        unit: newUnit,
      }),
    });
    setNewName("");
    setNewQty("");
    setShowAdd(false);
    fetchItems();
  };

  const lowStock = items.filter(
    (i) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold
  );
  const totalValue = items.reduce(
    (s, i) => s + i.current_quantity * (i.last_purchase_price_rm || 0),
    0
  );

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      {/* Header */}
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} aria-label="Back">
              <ArrowLeft size={18} className="text-stone-500" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">Inventory</h1>
              <p className="text-[11px] text-stone-500 leading-none">
                Stock levels + season ledger
              </p>
            </div>
          </div>
          <div className="flex gap-1">
            <button
              onClick={() => router.push("/receipts")}
              aria-label="Scan receipt"
              className="rounded-lg p-2 hover:bg-stone-100"
            >
              <Camera size={16} className="text-stone-500" />
            </button>
            <button
              onClick={() => setShowAdd((v) => !v)}
              aria-label="Add item"
              className="rounded-lg p-2 hover:bg-stone-100"
            >
              <Plus size={16} className="text-stone-500" />
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {/* Summary card */}
        <section className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="grid grid-cols-3 divide-x divide-stone-100 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">
                Items
              </p>
              <p className="mt-1 text-xl font-semibold text-stone-900">
                {items.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">
                Low stock
              </p>
              <p
                className={`mt-1 text-xl font-semibold ${
                  lowStock.length > 0 ? "text-red-600" : "text-stone-900"
                }`}
              >
                {lowStock.length}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-stone-400">
                Est. value
              </p>
              <p className="mt-1 text-xl font-semibold text-stone-900">
                RM {totalValue.toFixed(0)}
              </p>
            </div>
          </div>
        </section>

        {/* Low stock alert */}
        {lowStock.length > 0 && (
          <section className="rounded-xl border border-amber-200 bg-amber-50 p-3">
            <div className="flex items-center gap-2 text-amber-900">
              <AlertTriangle size={14} />
              <span className="text-sm font-medium">
                {lowStock.length}{" "}
                {lowStock.length === 1 ? "item is" : "items are"} below your
                reorder threshold
              </span>
            </div>
          </section>
        )}

        {/* Add form */}
        {showAdd && (
          <section className="space-y-2 rounded-xl border border-stone-200 bg-white p-3">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Item name (e.g. Mancozeb 80% WP)"
              className="w-full rounded-lg border border-stone-300 px-3 py-2 text-sm"
            />
            <div className="grid grid-cols-3 gap-2">
              <select
                value={newType}
                onChange={(e) => setNewType(e.target.value)}
                className="rounded-lg border border-stone-300 px-2 py-2 text-sm"
              >
                <option value="fertilizer">Fertiliser</option>
                <option value="pesticide">Pesticide</option>
                <option value="seed">Seed</option>
                <option value="tool">Tool</option>
                <option value="other">Other</option>
              </select>
              <input
                type="number"
                value={newQty}
                onChange={(e) => setNewQty(e.target.value)}
                placeholder="Qty"
                className="rounded-lg border border-stone-300 px-2 py-2 text-sm"
              />
              <select
                value={newUnit}
                onChange={(e) => setNewUnit(e.target.value)}
                className="rounded-lg border border-stone-300 px-2 py-2 text-sm"
              >
                <option value="kg">kg</option>
                <option value="g">g</option>
                <option value="L">L</option>
                <option value="ml">ml</option>
                <option value="sack">sack</option>
                <option value="pcs">pcs</option>
              </select>
            </div>
            <button
              onClick={addItem}
              className="w-full rounded-lg bg-emerald-600 py-2 text-sm font-medium text-white hover:bg-emerald-700"
            >
              Add to inventory
            </button>
          </section>
        )}

        {/* Items */}
        <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <h2 className="text-sm font-semibold text-stone-800">Stock</h2>
            <span className="text-xs text-stone-400">
              {items.length} {items.length === 1 ? "item" : "items"}
            </span>
          </div>
          {loading ? (
            <div className="space-y-2 p-3">
              {[1, 2, 3].map((i) => (
                <div
                  key={i}
                  className="h-10 animate-pulse rounded bg-stone-100"
                />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="px-4 py-12 text-center">
              <Package size={28} className="mx-auto mb-2 text-stone-300" />
              <p className="text-sm text-stone-400">No inventory yet</p>
              <p className="mt-1 text-xs text-stone-400">
                Scan a receipt or tap + to add
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {items.map((item) => {
                const isLow =
                  item.reorder_threshold &&
                  item.current_quantity <= item.reorder_threshold;
                return (
                  <li key={item.id}>
                    <button
                      onClick={() => router.push(`/inventory/${item.id}`)}
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-stone-50"
                    >
                      <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-stone-50">
                        {isLow ? (
                          <AlertTriangle size={16} className="text-red-500" />
                        ) : (
                          <Package size={16} className="text-stone-400" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-stone-800">
                          {item.item_name}
                        </p>
                        <p className="mt-0.5 text-[11px] text-stone-500">
                          {TYPE_LABEL[item.item_type] ?? item.item_type}
                          {item.supplier_name && ` · ${item.supplier_name}`}
                        </p>
                      </div>
                      <div className="flex-shrink-0 text-right">
                        <p
                          className={`text-sm font-medium ${
                            isLow ? "text-red-600" : "text-stone-800"
                          }`}
                        >
                          {item.current_quantity} {item.unit}
                        </p>
                        {isLow && (
                          <p className="text-[10px] text-red-500">
                            below {item.reorder_threshold}
                          </p>
                        )}
                      </div>
                      <ChevronRight
                        size={14}
                        className="flex-shrink-0 text-stone-300"
                      />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Coming soon: end-of-season verdict — left as a stub for now */}
        <section className="rounded-xl border border-dashed border-stone-300 bg-white p-4">
          <p className="text-[10px] uppercase tracking-wide text-stone-400">
            Coming soon
          </p>
          <p className="mt-1 text-sm text-stone-700">
            <strong>Season verdict:</strong> at end of season, AgroSim will tell
            you exactly what each crop earned per kg, so you know what to grow
            more of next time.
          </p>
        </section>
      </main>

    </div>
  );
}
