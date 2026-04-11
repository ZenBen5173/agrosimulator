"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Plus, ChevronDown } from "lucide-react";
import AISummary from "@/components/ui/AISummary";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface Equipment {
  id: string;
  name: string;
  category: string;
  purchase_date: string | null;
  purchase_price_rm: number | null;
  condition: string;
  annual_depreciation_rm: number;
  monthly_depreciation_rm: number;
  current_book_value_rm: number;
  years_owned: number;
  service_overdue: boolean;
}

const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];
const CONDITION_CLS: Record<string, string> = {
  excellent: "text-green-600", good: "text-green-600", fair: "text-amber-600", poor: "text-red-500", broken: "text-red-700",
};

export default function EquipmentPage() {
  const farmId = useFarmStore((s) => s.farm?.id);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", category: "irrigation", price: "", years: "5" });

  const fetchEquipment = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/equipment?farm_id=${farmId}`);
      if (res.ok) setItems(await res.json());
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [farmId]);

  useEffect(() => { fetchEquipment(); }, [fetchEquipment]);

  const addEquipment = async () => {
    if (!farmId || !form.name) return;
    await fetch("/api/equipment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ farm_id: farmId, name: form.name, category: form.category, purchase_price_rm: parseFloat(form.price) || null, useful_life_years: parseFloat(form.years) || 5, purchase_date: new Date().toISOString().split("T")[0] }),
    });
    setForm({ name: "", category: "irrigation", price: "", years: "5" });
    setShowAdd(false);
    fetchEquipment();
  };

  const totalValue = items.reduce((s, e) => s + e.current_book_value_rm, 0);
  const totalMonthlyDep = items.reduce((s, e) => s + e.monthly_depreciation_rm, 0);
  const serviceOverdue = items.filter((e) => e.service_overdue);

  // Chart data
  const byCategory = items.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + 1; return acc; }, {} as Record<string, number>);
  const categoryPieData = Object.entries(byCategory).map(([name, value]) => ({ name, value }));

  const valueByCategory = items.reduce((acc, e) => { acc[e.category] = (acc[e.category] || 0) + Math.round(e.current_book_value_rm); return acc; }, {} as Record<string, number>);
  const valuePieData = Object.entries(valueByCategory).map(([name, value]) => ({ name, value }));

  // AI Summary
  const summaryParts: string[] = [];
  summaryParts.push(`${items.length} item${items.length !== 1 ? "s" : ""} tracked, total book value RM${totalValue.toFixed(0)}`);
  summaryParts.push(`monthly depreciation RM${totalMonthlyDep.toFixed(0)}`);
  if (serviceOverdue.length > 0) summaryParts.push(`${serviceOverdue.length} overdue for service (${serviceOverdue.map((e) => e.name.split(" ")[0]).join(", ")})`);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Equipment"
        breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Equipment" }]}
        action={<button onClick={() => setShowAdd(!showAdd)} className="p-2 rounded-full hover:bg-gray-100"><Plus size={16} className="text-gray-400" /></button>}
      />

      <div className="px-4 pt-3 space-y-3">

        {/* AI Summary */}
        {items.length > 0 && <AISummary>{`${summaryParts.join(". ")}.`}</AISummary>}

        {/* Summary row */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Items</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{items.length}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Book Value</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">RM{totalValue.toFixed(0)}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400">Monthly Dep.</p>
              <p className="text-sm font-bold text-amber-600 mt-0.5">RM{totalMonthlyDep.toFixed(0)}</p>
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
                      <p className="text-[10px] text-gray-400 mb-1 text-center">By Category</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart><Pie data={categoryPieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                            {categoryPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie><Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} /></PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 text-[9px]">
                        {categoryPieData.map((d, i) => (<span key={d.name} className="flex items-center gap-1"><span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.name}</span>))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Value by Category</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart><Pie data={valuePieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                            {valuePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                          </Pie><Tooltip formatter={(v: unknown) => `RM${v}`} contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} /></PieChart>
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
              <input className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs" placeholder="Equipment name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="flex gap-2">
                <select className="flex-1 border border-gray-200 rounded-lg px-2 py-2 text-xs" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="irrigation">Irrigation</option><option value="spraying">Spraying</option><option value="harvesting">Harvesting</option><option value="transport">Transport</option><option value="storage">Storage</option><option value="other">Other</option>
                </select>
                <input className="w-20 border border-gray-200 rounded-lg px-2 py-2 text-xs" placeholder="Price RM" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <input className="w-14 border border-gray-200 rounded-lg px-2 py-2 text-xs" placeholder="Years" type="number" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} />
              </div>
              <button onClick={addEquipment} className="w-full bg-green-600 text-white py-2 rounded-lg text-xs font-medium">Add Equipment</button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Equipment table */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Equipment List</span>
            <span className="text-[10px] text-gray-400">{items.length} items</span>
          </div>
          {loading ? (
            <div className="p-3 space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-8 bg-gray-100 rounded animate-pulse" />)}</div>
          ) : items.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-gray-400">No equipment tracked yet</div>
          ) : (<><div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 text-[10px] text-gray-400 font-medium">
                <span className="flex-1">Name</span>
                <span>Condition</span>
                <span className="w-16 text-right">Value</span>
                <span className="w-3" />
              </div>{items.map((eq) => (
            <div key={eq.id} className="border-b border-gray-50 last:border-0">
              <button onClick={() => setExpandedId(expandedId === eq.id ? null : eq.id)}
                className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/50 transition-colors text-left">
                <div className="flex-1 min-w-0">
                  <span className="text-xs text-gray-800 font-medium">{eq.name}</span>
                  {eq.service_overdue && <span className="text-[9px] text-red-500 ml-1.5">overdue</span>}
                </div>
                <span className={`text-[10px] capitalize ${CONDITION_CLS[eq.condition] || "text-gray-500"}`}>{eq.condition}</span>
                <span className="text-xs font-medium text-gray-700 w-16 text-right">RM{eq.current_book_value_rm.toFixed(0)}</span>
                <motion.div animate={{ rotate: expandedId === eq.id ? 180 : 0 }} transition={{ duration: 0.15 }}>
                  <ChevronDown size={12} className="text-gray-300" />
                </motion.div>
              </button>
              <AnimatePresence>
                {expandedId === eq.id && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-50 bg-gray-50/30 px-3 pb-2.5 pt-2 text-xs space-y-1">
                    <div className="flex justify-between"><span className="text-gray-400">Category</span><span className="text-gray-700 capitalize">{eq.category}</span></div>
                    {eq.purchase_price_rm && <div className="flex justify-between"><span className="text-gray-400">Purchase price</span><span className="text-gray-700">RM{eq.purchase_price_rm.toFixed(2)}</span></div>}
                    <div className="flex justify-between"><span className="text-gray-400">Years owned</span><span className="text-gray-700">{eq.years_owned} yrs</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Annual depreciation</span><span className="text-amber-600">RM{eq.annual_depreciation_rm.toFixed(2)}</span></div>
                    <div className="flex justify-between"><span className="text-gray-400">Monthly depreciation</span><span className="text-amber-600">RM{eq.monthly_depreciation_rm.toFixed(2)}</span></div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}</>)}
        </div>
      </div>
    </div>
  );
}
