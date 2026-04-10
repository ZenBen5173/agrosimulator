"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plus,
  Wrench,
  AlertTriangle,
  TrendingDown,
  ChevronDown,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";

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
  last_serviced_date: string | null;
}

const CATEGORY_EMOJI: Record<string, string> = {
  irrigation: "💧",
  spraying: "🧴",
  harvesting: "🌾",
  transport: "🚜",
  storage: "📦",
  other: "🔧",
};

const CONDITION_COLORS: Record<string, string> = {
  excellent: "text-green-600 bg-green-50",
  good: "text-green-600 bg-green-50",
  fair: "text-amber-600 bg-amber-50",
  poor: "text-red-600 bg-red-50",
  broken: "text-red-700 bg-red-100",
};

export default function EquipmentPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [items, setItems] = useState<Equipment[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
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
      body: JSON.stringify({
        farm_id: farmId,
        name: form.name,
        category: form.category,
        purchase_price_rm: parseFloat(form.price) || null,
        useful_life_years: parseFloat(form.years) || 5,
        purchase_date: new Date().toISOString().split("T")[0],
      }),
    });
    setForm({ name: "", category: "irrigation", price: "", years: "5" });
    setShowAdd(false);
    fetchEquipment();
  };

  const totalValue = items.reduce((s, e) => s + e.current_book_value_rm, 0);
  const totalMonthlyDep = items.reduce((s, e) => s + e.monthly_depreciation_rm, 0);
  const serviceOverdue = items.filter((e) => e.service_overdue);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Equipment"
        action={<button onClick={() => setShowAdd(!showAdd)} className="p-2 rounded-full hover:bg-gray-100"><Plus size={18} className="text-gray-500" /></button>}
      />

      <div className="px-4 mt-4 space-y-3">
        <AnimatePresence>
          {showAdd && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="bg-white rounded-xl p-4 shadow-sm space-y-3">
              <input className="w-full border rounded-lg px-3 py-2 text-sm" placeholder="Equipment name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <div className="flex gap-2">
                <select className="flex-1 border rounded-lg px-3 py-2 text-sm" value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
                  <option value="irrigation">Irrigation</option>
                  <option value="spraying">Spraying</option>
                  <option value="harvesting">Harvesting</option>
                  <option value="transport">Transport</option>
                  <option value="storage">Storage</option>
                  <option value="other">Other</option>
                </select>
                <input className="w-24 border rounded-lg px-3 py-2 text-sm" placeholder="Price RM" type="number" value={form.price} onChange={(e) => setForm({ ...form, price: e.target.value })} />
                <input className="w-16 border rounded-lg px-3 py-2 text-sm" placeholder="Years" type="number" value={form.years} onChange={(e) => setForm({ ...form, years: e.target.value })} />
              </div>
              <button onClick={addEquipment} className="w-full bg-amber-600 text-white py-2 rounded-lg text-sm font-medium">Add Equipment</button>
            </motion.div>
          )}
        </AnimatePresence>

        {serviceOverdue.length > 0 && (
          <div className="bg-amber-50 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-500 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-amber-800">{serviceOverdue.length} items need servicing</p>
              <p className="text-xs text-amber-600 mt-1">{serviceOverdue.map((e) => e.name).join(", ")}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="bg-white rounded-xl p-4 shadow-sm animate-pulse"><div className="h-4 bg-gray-200 rounded w-1/2" /></div>)}</div>
        ) : items.length === 0 ? (
          <div className="text-center text-gray-400 mt-8">
            <Wrench size={48} className="mx-auto mb-3 opacity-40" />
            <p className="text-sm">No equipment tracked yet</p>
          </div>
        ) : (
          items.map((eq) => (
            <div key={eq.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button onClick={() => setExpandedId(expandedId === eq.id ? null : eq.id)} className="w-full flex items-center justify-between p-4">
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{CATEGORY_EMOJI[eq.category] || "🔧"}</span>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{eq.name}</p>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${CONDITION_COLORS[eq.condition] || ""}`}>{eq.condition}</span>
                      {eq.service_overdue && <span className="text-xs text-red-500 font-medium">Service overdue</span>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-gray-700">RM{eq.current_book_value_rm.toFixed(0)}</span>
                  <ChevronDown size={16} className="text-gray-400" />
                </div>
              </button>
              <AnimatePresence>
                {expandedId === eq.id && (
                  <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="border-t border-gray-100 px-4 pb-3 text-sm space-y-2">
                    {eq.purchase_price_rm && <div className="flex justify-between"><span className="text-gray-500">Purchase price</span><span>RM{eq.purchase_price_rm.toFixed(2)}</span></div>}
                    <div className="flex justify-between"><span className="text-gray-500">Years owned</span><span>{eq.years_owned} yrs</span></div>
                    <div className="flex justify-between text-amber-600"><span className="flex items-center gap-1"><TrendingDown size={14} /> Monthly depreciation</span><span>RM{eq.monthly_depreciation_rm.toFixed(2)}</span></div>
                    {eq.last_serviced_date && <div className="flex justify-between"><span className="text-gray-500">Last serviced</span><span>{eq.last_serviced_date}</span></div>}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
