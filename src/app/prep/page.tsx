"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Droplets,
  Leaf,
  Bug,
  Clock,
  DollarSign,
  RefreshCw,
  ChevronDown,
  AlertTriangle,
} from "lucide-react";
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

export default function PrepListPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [data, setData] = useState<PrepList | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);

  const fetchPrep = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/prep-list?farm_id=${farmId}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error("Prep list fetch error:", err);
    } finally {
      setLoading(false);
    }
  }, [farmId]);

  useEffect(() => { fetchPrep(); }, [fetchPrep]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-3 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3 mb-4">
          <button onClick={() => router.back()} className="p-1">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Today&apos;s Prep List</h1>
          <button onClick={fetchPrep} className="ml-auto p-2 rounded-full bg-white/20">
            <RefreshCw size={18} />
          </button>
        </div>
        {data && (
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-white/15 rounded-xl p-3 text-center">
              <Droplets size={20} className="mx-auto mb-1" />
              <p className="text-lg font-bold">{data.total_water_litres}L</p>
              <p className="text-xs opacity-80">Water</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3 text-center">
              <Clock size={20} className="mx-auto mb-1" />
              <p className="text-lg font-bold">{data.total_labour_minutes}m</p>
              <p className="text-xs opacity-80">Labour</p>
            </div>
            <div className="bg-white/15 rounded-xl p-3 text-center">
              <DollarSign size={20} className="mx-auto mb-1" />
              <p className="text-lg font-bold">RM{data.total_estimated_cost_rm.toFixed(2)}</p>
              <p className="text-xs opacity-80">Cost</p>
            </div>
          </div>
        )}
      </div>

      {data && (
        <div className="px-4 mt-4 space-y-3">
          {/* Bring Today Summary */}
          {(data.total_fertilizer_items.length > 0 || data.total_pesticide_items.length > 0) && (
            <div className="bg-white rounded-xl p-4 shadow-sm">
              <h2 className="font-semibold text-gray-800 mb-3">Bring Today</h2>
              {data.total_water_litres > 0 && (
                <div className="flex items-center gap-3 py-2 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center">
                    <Droplets size={16} className="text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">Water</p>
                  </div>
                  <p className="text-sm font-bold text-blue-600">{data.total_water_litres} litres</p>
                </div>
              )}
              {data.total_fertilizer_items.map((f) => (
                <div key={f.type} className="flex items-center gap-3 py-2 border-b border-gray-100">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <Leaf size={16} className="text-green-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{f.type}</p>
                  </div>
                  <p className="text-sm font-bold text-green-600">{f.grams}g</p>
                </div>
              ))}
              {data.total_pesticide_items.map((p) => (
                <div key={p.type} className="flex items-center gap-3 py-2 border-b border-gray-100 last:border-0">
                  <div className="w-8 h-8 rounded-full bg-amber-100 flex items-center justify-center">
                    <Bug size={16} className="text-amber-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{p.type}</p>
                  </div>
                  <p className="text-sm font-bold text-amber-600">{p.ml}ml</p>
                </div>
              ))}
            </div>
          )}

          {/* Per-plot breakdown */}
          <h2 className="font-semibold text-gray-800 mt-4">Plot Breakdown</h2>
          {data.plots.map((plot) => (
            <div key={plot.label} className="bg-white rounded-xl shadow-sm overflow-hidden">
              <button
                onClick={() => setExpandedPlot(expandedPlot === plot.label ? null : plot.label)}
                className="w-full flex items-center justify-between p-4"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <span className="text-sm font-bold text-green-700">{plot.label}</span>
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-gray-800">{plot.crop_name}</p>
                    <p className="text-xs text-gray-500 capitalize">{plot.growth_stage}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {plot.estimated_cost_rm > 0 && (
                    <span className="text-xs font-medium text-gray-500">RM{plot.estimated_cost_rm.toFixed(2)}</span>
                  )}
                  <motion.div animate={{ rotate: expandedPlot === plot.label ? 180 : 0 }}>
                    <ChevronDown size={18} className="text-gray-400" />
                  </motion.div>
                </div>
              </button>
              <AnimatePresence>
                {expandedPlot === plot.label && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="border-t border-gray-100 px-4 pb-4 space-y-2"
                  >
                    {plot.skip_water ? (
                      <div className="flex items-center gap-2 py-1 text-sm text-blue-600">
                        <Droplets size={14} />
                        <span>{plot.skip_water_reason || "No watering needed"}</span>
                      </div>
                    ) : plot.water_litres > 0 ? (
                      <div className="flex items-center justify-between py-1 text-sm">
                        <span className="flex items-center gap-2 text-gray-600">
                          <Droplets size={14} className="text-blue-500" /> Water
                        </span>
                        <span className="font-medium">{plot.water_litres}L</span>
                      </div>
                    ) : null}
                    {plot.fertilizer_due && plot.fertilizer_type && (
                      <div className="flex items-center justify-between py-1 text-sm">
                        <span className="flex items-center gap-2 text-gray-600">
                          <Leaf size={14} className="text-green-500" /> {plot.fertilizer_type}
                        </span>
                        <span className="font-medium">{plot.fertilizer_grams}g</span>
                      </div>
                    )}
                    {plot.pesticide_due && plot.pesticide_type && (
                      <div className="flex items-center justify-between py-1 text-sm">
                        <span className="flex items-center gap-2 text-gray-600">
                          <Bug size={14} className="text-amber-500" /> {plot.pesticide_type}
                        </span>
                        <span className="font-medium">{plot.pesticide_ml}ml</span>
                      </div>
                    )}
                    {!plot.fertilizer_due && !plot.pesticide_due && !plot.water_litres && (
                      <p className="text-sm text-gray-400 py-1">No resources needed today</p>
                    )}
                    <div className="flex items-center justify-between py-1 text-sm border-t border-gray-50 mt-1">
                      <span className="text-gray-600">Labour</span>
                      <span className="font-medium">{plot.labour_minutes} min</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {/* Low stock warning */}
          {data.total_fertilizer_items.length === 0 && data.total_pesticide_items.length === 0 && (
            <div className="bg-amber-50 rounded-xl p-4 flex items-start gap-3">
              <AlertTriangle size={20} className="text-amber-500 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-amber-800">No resources needed today</p>
                <p className="text-xs text-amber-600 mt-1">All plots are up to date with fertilizer and pesticide applications.</p>
              </div>
            </div>
          )}
        </div>
      )}

      {!data && !loading && (
        <div className="px-4 mt-8 text-center text-gray-500">
          <p>No prep list available. Make sure you have active plots.</p>
        </div>
      )}
    </div>
  );
}
