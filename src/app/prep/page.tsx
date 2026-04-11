"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RefreshCw, ChevronDown } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";

interface PlotNeed {
  label: string;
  crop_name: string;
  growth_stage: string;
  water_litres: number;
  skip_water: boolean;
  skip_water_reason: string | null;
  fertilizer_type: string | null;
  fertilizer_grams: number;
  fertilizer_due: boolean;
  pesticide_type: string | null;
  pesticide_ml: number;
  pesticide_due: boolean;
  labour_minutes: number;
  estimated_cost_rm: number;
}

interface PrepList {
  total_water_litres: number;
  total_fertilizer_items: { type: string; grams: number }[];
  total_pesticide_items: { type: string; ml: number }[];
  total_labour_minutes: number;
  total_estimated_cost_rm: number;
  plots: PlotNeed[];
}

interface InventoryItem {
  item_name: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
}

export default function PrepListPage() {
  const farmId = useFarmStore((s) => s.farm?.id);
  const [data, setData] = useState<PrepList | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);

  const fetchPrep = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const [prepRes, invRes] = await Promise.all([
        fetch(`/api/prep-list?farm_id=${farmId}`),
        fetch(`/api/inventory?farm_id=${farmId}`),
      ]);
      if (prepRes.ok) setData(await prepRes.json());
      if (invRes.ok) {
        const items = await invRes.json();
        if (Array.isArray(items)) setInventory(items);
      }
    } catch (err) {
      console.error("Prep list fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => { fetchPrep(); }, [fetchPrep]);

  // Find stock level for an item
  const getStock = (itemName: string): { qty: number; unit: string; isLow: boolean } | null => {
    const match = inventory.find((i) =>
      i.item_name.toLowerCase().includes(itemName.toLowerCase().split(" ")[0]) ||
      itemName.toLowerCase().includes(i.item_name.toLowerCase().split(" ")[0])
    );
    if (!match) return null;
    return {
      qty: match.current_quantity,
      unit: match.unit,
      isLow: match.reorder_threshold ? match.current_quantity <= match.reorder_threshold : false,
    };
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Prep List" />
        <div className="px-4 pt-4 space-y-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-gray-100 rounded-lg animate-pulse" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Prep List" />
        <div className="px-4 pt-12 text-center text-sm text-gray-400">
          No prep list available. Make sure you have active plots.
        </div>
      </div>
    );
  }

  // Aggregate all resources into one flat list
  const allResources: { name: string; needed: string; stock: { qty: number; unit: string; isLow: boolean } | null; category: string }[] = [];
  for (const f of data.total_fertilizer_items) {
    allResources.push({ name: f.type, needed: `${f.grams}g`, stock: getStock(f.type), category: "Fertilizer" });
  }
  for (const p of data.total_pesticide_items) {
    allResources.push({ name: p.type, needed: `${p.ml}ml`, stock: getStock(p.type), category: "Pesticide" });
  }
  if (data.total_water_litres > 0) {
    allResources.push({ name: "Water", needed: `${data.total_water_litres}L`, stock: null, category: "Water" });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Prep List"
        action={<button onClick={fetchPrep} className="p-2 rounded-full hover:bg-gray-100"><RefreshCw size={16} className="text-gray-400" /></button>}
      />

      <div className="px-4 pt-3 space-y-3">

        {/* ── Summary row ── */}
        <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-white px-3 py-2.5">
          <div className="flex items-center gap-4 text-xs text-gray-500">
            <span><span className="font-semibold text-gray-800">{data.total_water_litres}L</span> water</span>
            <span><span className="font-semibold text-gray-800">{data.total_labour_minutes}</span> min work</span>
            <span><span className="font-semibold text-gray-800">{data.plots.length}</span> plots</span>
          </div>
          <span className="text-sm font-semibold text-gray-900">RM{data.total_estimated_cost_rm.toFixed(2)}</span>
        </div>

        {/* ── AI Summary ── */}
        {(() => {
          const parts: string[] = [];
          const allInStock = allResources.every((r) => !r.stock?.isLow);
          parts.push(allInStock ? "All items in stock" : `Low stock on ${allResources.filter((r) => r.stock?.isLow).map((r) => r.name.split(" (")[0]).join(", ")}`);
          const maxWaterPlot = data.plots.reduce((max, p) => p.water_litres > (max?.water_litres || 0) ? p : max, data.plots[0]);
          if (maxWaterPlot && maxWaterPlot.water_litres > 0) parts.push(`Plot ${maxWaterPlot.label} needs the most water (${maxWaterPlot.water_litres}L) \u2014 start there`);
          if (data.total_labour_minutes > 60) parts.push(`plan ${Math.round(data.total_labour_minutes / 60)}+ hours of field work`);
          else parts.push(`about ${data.total_labour_minutes} minutes of work total`);
          return (
            <div className="py-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">AI Summary</p>
              <p className="text-xs text-gray-600 leading-relaxed">{parts.join(". ")}.</p>
            </div>
          );
        })()}

        {/* ── Resources table ── */}
        {allResources.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">What to Bring</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-50">
                  <th className="text-left font-medium px-3 py-1.5">Item</th>
                  <th className="text-left font-medium px-3 py-1.5 w-16">Type</th>
                  <th className="text-right font-medium px-3 py-1.5">Need</th>
                  <th className="text-right font-medium px-3 py-1.5">Stock</th>
                </tr>
              </thead>
              <tbody>
                {allResources.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-gray-800 font-medium">
                      <div className="flex items-center gap-1.5">
                        {r.stock?.isLow && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                        {r.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-gray-400 text-[10px]">{r.category}</td>
                    <td className="px-3 py-2 text-right text-gray-700 font-medium">{r.needed}</td>
                    <td className={`px-3 py-2 text-right ${r.stock?.isLow ? "text-red-500 font-medium" : "text-gray-400"}`}>
                      {r.stock ? `${r.stock.qty} ${r.stock.unit}` : "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── Per-plot breakdown ── */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">By Plot</span>
          </div>

          {data.plots.map((plot) => {
            const isExpanded = expandedPlot === plot.label;
            const hasResources = plot.water_litres > 0 || plot.fertilizer_due || plot.pesticide_due;

            return (
              <div key={plot.label} className="border-b border-gray-50 last:border-0">
                <button
                  onClick={() => setExpandedPlot(isExpanded ? null : plot.label)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/50 transition-colors"
                >
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono w-6 text-center flex-shrink-0">{plot.label}</span>
                  <div className="flex-1 text-left min-w-0">
                    <span className="text-xs text-gray-800">{plot.crop_name}</span>
                    <span className="text-[10px] text-gray-400 ml-1.5 capitalize">{plot.growth_stage}</span>
                  </div>
                  {!hasResources && <span className="text-[10px] text-gray-300">--</span>}
                  {plot.estimated_cost_rm > 0 && (
                    <span className="text-[10px] text-gray-500">RM{plot.estimated_cost_rm.toFixed(2)}</span>
                  )}
                  <span className="text-[10px] text-gray-400">{plot.labour_minutes}m</span>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronDown size={12} className="text-gray-300" />
                  </motion.div>
                </button>

                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-50 bg-gray-50/30"
                    >
                      <table className="w-full text-xs">
                        <tbody>
                          {plot.skip_water ? (
                            <tr>
                              <td className="px-3 py-1.5 text-gray-400" colSpan={2}>
                                Water: skipped — {plot.skip_water_reason || "not needed"}
                              </td>
                            </tr>
                          ) : plot.water_litres > 0 ? (
                            <tr className="border-b border-gray-50">
                              <td className="px-3 py-1.5 text-gray-600">Water</td>
                              <td className="px-3 py-1.5 text-right text-gray-800 font-medium">{plot.water_litres}L</td>
                            </tr>
                          ) : null}
                          {plot.fertilizer_due && plot.fertilizer_type && (
                            <tr className="border-b border-gray-50">
                              <td className="px-3 py-1.5 text-gray-600">{plot.fertilizer_type}</td>
                              <td className="px-3 py-1.5 text-right text-gray-800 font-medium">{plot.fertilizer_grams}g</td>
                            </tr>
                          )}
                          {plot.pesticide_due && plot.pesticide_type && (
                            <tr className="border-b border-gray-50">
                              <td className="px-3 py-1.5 text-gray-600">{plot.pesticide_type}</td>
                              <td className="px-3 py-1.5 text-right text-gray-800 font-medium">{plot.pesticide_ml}ml</td>
                            </tr>
                          )}
                          {!hasResources && (
                            <tr>
                              <td className="px-3 py-1.5 text-gray-400" colSpan={2}>No resources needed today</td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        {allResources.length === 0 && (
          <div className="rounded-lg border border-gray-200 bg-white px-3 py-6 text-center text-xs text-gray-400">
            All plots are up to date. No resources needed today.
          </div>
        )}
      </div>
    </div>
  );
}
