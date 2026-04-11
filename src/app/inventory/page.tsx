"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, Camera, ChevronDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

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

const CHART_COLORS = ["#22c55e", "#8b5cf6", "#3b82f6", "#f59e0b", "#06b6d4"];

export default function InventoryPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
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
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [farmId]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const addItem = async () => {
    if (!farmId || !newName) return;
    await fetch("/api/inventory", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farm_id: farmId, item_name: newName, item_type: newType, current_quantity: parseFloat(newQty) || 0, unit: newUnit }),
    });
    setNewName(""); setNewQty(""); setShowAdd(false);
    fetchItems();
  };

  const lowStock = items.filter((i) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold);
  const totalValue = items.reduce((s, i) => s + (i.current_quantity * (i.last_purchase_price_rm || 0)), 0);

  // Chart data
  const byType = items.reduce((acc, i) => {
    acc[i.item_type] = (acc[i.item_type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const pieData = Object.entries(byType).map(([name, value]) => ({ name, value }));

  const valueByType = items.reduce((acc, i) => {
    const val = i.current_quantity * (i.last_purchase_price_rm || 0);
    acc[i.item_type] = (acc[i.item_type] || 0) + Math.round(val * 100) / 100;
    return acc;
  }, {} as Record<string, number>);
  const valuePieData = Object.entries(valueByType).map(([name, value]) => ({ name, value }));

  // AI Summary
  const summaryParts: string[] = [];
  summaryParts.push(`${items.length} items tracked, est. value RM${totalValue.toFixed(2)}`);
  if (lowStock.length > 0) summaryParts.push(`${lowStock.length} below reorder threshold (${lowStock.map((i) => i.item_name.split(" (")[0]).join(", ")})`);
  else summaryParts.push("all stock levels healthy");

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Inventory"
        breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Inventory" }]}
        action={
          <div className="flex gap-1">
            <button onClick={() => router.push("/inventory/scan")} className="p-2 rounded-full hover:bg-gray-100"><Camera size={16} className="text-gray-400" /></button>
            <button onClick={() => setShowAdd(!showAdd)} className="p-2 rounded-full hover:bg-gray-100"><Plus size={16} className="text-gray-400" /></button>
          </div>
        }
      />

      <div className="px-4 pt-3 space-y-3">

        {/* AI Summary */}
        <div className="py-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">AI Summary</p>
          <p className="text-xs text-gray-600 leading-relaxed">{summaryParts.join(". ")}.</p>
        </div>

        {/* Summary row */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Items</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{items.length}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Low Stock</p>
              <p className={`text-sm font-bold mt-0.5 ${lowStock.length > 0 ? "text-red-500" : "text-gray-800"}`}>{lowStock.length}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Est. Value</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">RM{totalValue.toFixed(0)}</p>
            </div>
          </div>
        </div>

        {/* Charts dropdown */}
        {items.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <button onClick={() => setChartsOpen(!chartsOpen)} className="w-full px-3 py-2.5 flex items-center justify-between">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Statistics</span>
              <motion.div animate={{ rotate: chartsOpen ? 180 : 0 }} transition={{ duration: 0.15 }}>
                <ChevronDown size={14} className="text-gray-300" />
              </motion.div>
            </button>
            <AnimatePresence>
              {chartsOpen && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-100 px-3 py-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Items by Type</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={pieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                              {pieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 text-[9px]">
                        {pieData.map((d, i) => (
                          <span key={d.name} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Value by Type</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={valuePieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                              {valuePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `RM${v}`} contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Add form */}
        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
              className="rounded-lg border border-gray-200 bg-white p-3 space-y-2">
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs" placeholder="Item name (e.g. Baja Hijau)" value={newName} onChange={(e) => setNewName(e.target.value)} />
              <div className="flex gap-2">
                <select className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs" value={newType} onChange={(e) => setNewType(e.target.value)}>
                  <option value="fertilizer">Fertilizer</option><option value="pesticide">Pesticide</option><option value="seed">Seed</option><option value="tool">Tool</option><option value="other">Other</option>
                </select>
                <input className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-xs" placeholder="Qty" type="number" value={newQty} onChange={(e) => setNewQty(e.target.value)} />
                <select className="w-16 border border-gray-200 rounded-lg px-2 py-2 text-xs" value={newUnit} onChange={(e) => setNewUnit(e.target.value)}>
                  <option value="kg">kg</option><option value="g">g</option><option value="L">L</option><option value="ml">ml</option><option value="pcs">pcs</option>
                </select>
              </div>
              <button onClick={addItem} className="w-full bg-green-600 text-white py-2 rounded-lg text-xs font-medium">Add Item</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Items table */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Stock</span>
            <span className="text-[10px] text-gray-400">{items.length} items</span>
          </div>
          {loading ? (
            <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-gray-400">No inventory items yet</div>
          ) : (
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-50">
                  <th className="text-left font-medium px-3 py-1.5">Item</th>
                  <th className="text-left font-medium px-2 py-1.5 w-16">Type</th>
                  <th className="text-right font-medium px-2 py-1.5">Stock</th>
                  <th className="text-right font-medium px-3 py-1.5">Price/unit</th>
                </tr>
              </thead>
              <tbody>
                {items.map((item) => {
                  const isLow = item.reorder_threshold && item.current_quantity <= item.reorder_threshold;
                  return (
                    <tr key={item.id} className="border-b border-gray-50 last:border-0">
                      <td className="px-3 py-2 text-gray-800">
                        <div className="flex items-center gap-1.5">
                          {isLow && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                          <span className="font-medium">{item.item_name}</span>
                        </div>
                        {item.supplier_name && <p className="text-[10px] text-gray-400 mt-0.5">{item.supplier_name}</p>}
                      </td>
                      <td className="px-2 py-2 text-[10px] text-gray-400 capitalize">{item.item_type}</td>
                      <td className={`px-2 py-2 text-right font-medium ${isLow ? "text-red-500" : "text-gray-700"}`}>
                        {item.current_quantity} {item.unit}
                      </td>
                      <td className="px-3 py-2 text-right text-gray-500">
                        {item.last_purchase_price_rm ? `RM${item.last_purchase_price_rm.toFixed(2)}` : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
