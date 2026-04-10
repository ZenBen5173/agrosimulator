"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Plus,
  Package,
  AlertTriangle,
  Camera,
  ChevronDown,
  Trash2,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";

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

const TYPE_COLORS: Record<string, string> = {
  fertilizer: "bg-green-100 text-green-700",
  pesticide: "bg-amber-100 text-amber-700",
  seed: "bg-blue-100 text-blue-700",
  tool: "bg-gray-100 text-gray-700",
  other: "bg-purple-100 text-purple-700",
};

export default function InventoryPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Add form state
  const [newName, setNewName] = useState("");
  const [newType, setNewType] = useState("fertilizer");
  const [newQty, setNewQty] = useState("");
  const [newUnit, setNewUnit] = useState("kg");

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

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async () => {
    if (!farmId || !newName) return;
    try {
      const res = await fetch("/api/inventory", {
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
      if (res.ok) {
        setNewName(""); setNewQty(""); setShowAdd(false);
        fetchItems();
      }
    } catch (err) { console.error(err); }
  };

  const lowStock = items.filter(
    (i) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold
  );

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-3">
          <button onClick={() => router.back()} className="p-1"><ArrowLeft size={24} /></button>
          <h1 className="text-xl font-bold">Inventory</h1>
          <div className="ml-auto flex gap-2">
            <button
              onClick={() => router.push("/inventory/scan")}
              className="p-2 rounded-full bg-white/20"
            >
              <Camera size={18} />
            </button>
            <button
              onClick={() => setShowAdd(!showAdd)}
              className="p-2 rounded-full bg-white/20"
            >
              <Plus size={18} />
            </button>
          </div>
        </div>
        <div className="flex gap-3">
          <div className="bg-white/15 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="text-2xl font-bold">{items.length}</p>
            <p className="text-xs opacity-80">Items</p>
          </div>
          <div className="bg-white/15 rounded-xl px-4 py-2 flex-1 text-center">
            <p className="text-2xl font-bold text-amber-300">{lowStock.length}</p>
            <p className="text-xs opacity-80">Low Stock</p>
          </div>
        </div>
      </div>

      <div className="px-4 mt-4 space-y-3">
        {/* Add form */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="bg-white rounded-xl p-4 shadow-sm space-y-3"
            >
              <input
                className="w-full border rounded-lg px-3 py-2 text-sm"
                placeholder="Item name (e.g. NPK 15-15-15)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
              />
              <div className="flex gap-2">
                <select
                  className="flex-1 border rounded-lg px-3 py-2 text-sm"
                  value={newType}
                  onChange={(e) => setNewType(e.target.value)}
                >
                  <option value="fertilizer">Fertilizer</option>
                  <option value="pesticide">Pesticide</option>
                  <option value="seed">Seed</option>
                  <option value="tool">Tool</option>
                  <option value="other">Other</option>
                </select>
                <input
                  className="w-20 border rounded-lg px-3 py-2 text-sm"
                  placeholder="Qty"
                  type="number"
                  value={newQty}
                  onChange={(e) => setNewQty(e.target.value)}
                />
                <select
                  className="w-20 border rounded-lg px-3 py-2 text-sm"
                  value={newUnit}
                  onChange={(e) => setNewUnit(e.target.value)}
                >
                  <option value="kg">kg</option>
                  <option value="g">g</option>
                  <option value="L">L</option>
                  <option value="ml">ml</option>
                  <option value="pcs">pcs</option>
                  <option value="bag">bag</option>
                </select>
              </div>
              <button
                onClick={addItem}
                className="w-full bg-purple-600 text-white py-2 rounded-lg text-sm font-medium"
              >
                Add Item
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Low stock warning */}
        {lowStock.length > 0 && (
          <div className="bg-amber-50 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">{lowStock.length} items low on stock</p>
              <p className="text-xs text-amber-600 mt-1">
                {lowStock.map((i) => i.item_name).join(", ")}
              </p>
            </div>
          </div>
        )}

        {/* Items list */}
        {loading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-white rounded-xl p-4 shadow-sm animate-pulse">
                <div className="h-4 bg-gray-200 rounded w-1/2 mb-2" />
                <div className="h-3 bg-gray-100 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <Package size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No inventory items yet</p>
            <p className="text-xs mt-1">Tap + to add items or scan a receipt</p>
          </div>
        ) : (
          items.map((item) => {
            const isLow = item.reorder_threshold && item.current_quantity <= item.reorder_threshold;
            return (
              <div key={item.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                <button
                  onClick={() => setExpandedId(expandedId === item.id ? null : item.id)}
                  className="w-full flex items-center justify-between p-4"
                >
                  <div className="flex items-center gap-3">
                    <div className={`px-2 py-1 rounded-md text-xs font-medium ${TYPE_COLORS[item.item_type] || TYPE_COLORS.other}`}>
                      {item.item_type}
                    </div>
                    <div className="text-left">
                      <p className="text-sm font-medium text-gray-800">{item.item_name}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${isLow ? "text-red-500" : "text-gray-700"}`}>
                      {item.current_quantity} {item.unit}
                    </span>
                    {isLow && <AlertTriangle size={14} className="text-red-500" />}
                    <ChevronDown size={16} className="text-gray-400" />
                  </div>
                </button>
                <AnimatePresence>
                  {expandedId === item.id && (
                    <motion.div
                      initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                      className="border-t border-gray-100 px-4 pb-3 text-sm text-gray-500 space-y-1"
                    >
                      {item.last_purchase_price_rm && (
                        <p>Last price: RM{item.last_purchase_price_rm.toFixed(2)}/{item.unit}</p>
                      )}
                      {item.supplier_name && <p>Supplier: {item.supplier_name}</p>}
                      {item.reorder_threshold && (
                        <p>Reorder at: {item.reorder_threshold} {item.unit}</p>
                      )}
                      <button className="text-red-400 text-xs flex items-center gap-1 mt-2">
                        <Trash2 size={12} /> Remove
                      </button>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
