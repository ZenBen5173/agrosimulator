"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, ChevronRight } from "lucide-react";
import AISummary from "@/components/ui/AISummary";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import FarmSwitcher from "@/components/home/FarmSwitcher";
import NotificationBell from "@/components/NotificationBell";
import PlotBottomSheet from "@/components/PlotBottomSheet";
import { SkeletonCard } from "@/components/ui/Skeleton";
import type { PlotData } from "@/types/farm";
import toast from "react-hot-toast";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

const FarmMapView = dynamic(() => import("@/components/FarmMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-900">
      <p className="text-green-400 text-sm">Loading map...</p>
    </div>
  ),
});

const STAGE_LABELS: Record<string, string> = {
  seedling: "Seedling", growing: "Growing", mature: "Mature", harvest_ready: "Harvest Ready", harvested: "Harvested",
};
const WARNING_CLS: Record<string, string> = {
  none: "text-green-600", yellow: "text-amber-500", orange: "text-orange-500", red: "text-red-500",
};
const CHART_COLORS = ["#22c55e", "#84cc16", "#10b981", "#f59e0b", "#9ca3af"];

export default function FarmTabPage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useFarmStore();
  const { farm, farms, plots, weather, selectedPlot } = store;

  const [loading, setLoading] = useState(!farm);
  const [extraPolygons, setExtraPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [zoneOverlays, setZoneOverlays] = useState<
    { label: string; crop: string; colour: string; polygon: GeoJSON.Polygon; warningLevel?: string }[]
  >([]);
  const [mapExpanded, setMapExpanded] = useState(true);
  const [chartsOpen, setChartsOpen] = useState(false);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);

  useEffect(() => {
    if (farm && plots.length > 0) { fetchMapData(farm.id); return; }
    async function loadFarm() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }
      const { data: allFarms } = await supabase.from("farms").select("id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box").eq("onboarding_done", true).order("created_at", { ascending: false });
      if (!allFarms || allFarms.length === 0) { router.replace("/onboarding"); return; }
      store.setFarms(allFarms);
      const farmRow = allFarms[0];
      store.setFarm(farmRow);
      const { data: plotRows } = await supabase.from("plots").select("id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url").eq("farm_id", farmRow.id);
      store.setPlots(plotRows || []);
      fetchMapData(farmRow.id);
      setLoading(false);
    }
    loadFarm();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function fetchMapData(farmId: string) {
    const [parcelsRes, zonesRes] = await Promise.all([
      supabase.from("farm_features").select("geometry_geojson").eq("farm_id", farmId).eq("feature_type", "parcel"),
      supabase.from("farm_zones").select("zone_label, suggested_crop, crop_override, colour_hex, geometry_geojson").eq("farm_id", farmId).order("zone_label"),
    ]);
    setExtraPolygons((parcelsRes.data || []).map((r: { geometry_geojson: unknown }) => r.geometry_geojson as GeoJSON.Polygon).filter((g): g is GeoJSON.Polygon => !!g));
    setZoneOverlays((zonesRes.data || []).filter((z: { geometry_geojson: unknown }) => z.geometry_geojson).map((z: { zone_label: string; suggested_crop: string; crop_override: string | null; colour_hex: string; geometry_geojson: unknown }) => {
      const matchingPlot = plots.find((p) => p.label === z.zone_label);
      return { label: z.zone_label, crop: z.crop_override || z.suggested_crop, colour: z.colour_hex, polygon: z.geometry_geojson as GeoJSON.Polygon, warningLevel: matchingPlot?.warning_level };
    }));
    setLoading(false);
  }

  const handleTileClick = useCallback((plotLabel: string) => {
    const plot = plots.find((p) => p.label === plotLabel);
    if (plot) store.setSelectedPlot(plot);
  }, [plots, store]);

  const handleHarvest = useCallback(async (plotId: string) => {
    try {
      const res = await fetch("/api/plots/harvest", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ plot_id: plotId }) });
      if (res.ok) { store.updatePlot(plotId, { growth_stage: "harvested", warning_level: "none" }); toast.success("Plot harvested!"); }
    } catch { toast.error("Failed to harvest"); }
  }, [store]);

  if (loading || !farm) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="h-[40vh] animate-pulse bg-gray-200" />
        <div className="px-4 pt-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      </div>
    );
  }

  // Chart data
  const byStage = plots.reduce((acc, p) => { acc[p.growth_stage] = (acc[p.growth_stage] || 0) + 1; return acc; }, {} as Record<string, number>);
  const stagePieData = Object.entries(byStage).map(([name, value]) => ({ name: STAGE_LABELS[name] || name, value }));
  const byWarning = plots.reduce((acc, p) => { acc[p.warning_level || "none"] = (acc[p.warning_level || "none"] || 0) + 1; return acc; }, {} as Record<string, number>);

  // AI Summary
  const atRisk = plots.filter((p) => p.warning_level === "red" || p.warning_level === "orange");
  const summaryParts: string[] = [];
  if (atRisk.length > 0) summaryParts.push(`${atRisk.length} plot${atRisk.length > 1 ? "s" : ""} need attention (${atRisk.map((p) => p.label).join(", ")})`);
  else summaryParts.push(`All ${plots.length} plots healthy`);
  const dominantStage = Object.entries(byStage).sort((a, b) => b[1] - a[1])[0];
  if (dominantStage) summaryParts.push(`Mostly ${dominantStage[0]} stage`);
  const harvestReady = plots.filter((p) => p.growth_stage === "harvest_ready");
  if (harvestReady.length > 0) summaryParts.push(`${harvestReady.length} ready to harvest`);

  const getProgress = (planted: string | null, harvest: string | null): number => {
    if (!planted || !harvest) return 0;
    const now = Date.now();
    const start = new Date(planted).getTime();
    const end = new Date(harvest).getTime();
    if (end <= start) return 1;
    return Math.min(1, Math.max(0, (now - start) / (end - start)));
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          {farms.length > 1 ? <FarmSwitcher /> : (
            <h1 className="text-base font-semibold text-gray-900">Farm</h1>
          )}
          <NotificationBell />
        </div>
      </div>

      {/* Map (collapsible) */}
      <div className="rounded-lg border border-gray-200 bg-white mx-4 mt-3 overflow-hidden">
        <button onClick={() => setMapExpanded(!mapExpanded)} className="w-full px-3 py-2.5 flex items-center justify-between">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Farm Map</span>
          <motion.div animate={{ rotate: mapExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
            <ChevronDown size={14} className="text-gray-300" />
          </motion.div>
        </button>
        <AnimatePresence>
          {mapExpanded && (
            <motion.div initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }} className="border-t border-gray-100">
              <div className="h-[40vh] bg-gray-900">
                {farm.polygon_geojson && farm.bounding_box ? (
                  <FarmMapView
                    polygonGeoJson={farm.polygon_geojson}
                    boundingBox={farm.bounding_box}
                    extraPolygons={extraPolygons}
                    zones={zoneOverlays}
                    plots={plots.map((p) => ({ label: p.label, crop: p.crop_name, colour: p.colour_hex, growthStage: p.growth_stage, warningLevel: p.warning_level }))}
                    onPlotClick={handleTileClick}
                  />
                ) : (
                  <div className="flex h-full items-center justify-center">
                    <p className="text-gray-400 text-xs">No farm boundary drawn yet</p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="px-4 pt-3 space-y-3">

        {/* AI Summary */}
        <AISummary>{`${summaryParts.join(". ")}.`}</AISummary>

        {/* Summary row */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-4 divide-x divide-gray-100">
            <div className="px-2 py-3 text-center">
              <p className="text-[10px] text-gray-400">Plots</p>
              <p className="text-sm font-bold text-gray-800 mt-0.5">{plots.length}</p>
            </div>
            <div className="px-2 py-3 text-center">
              <p className="text-[10px] text-gray-400">Healthy</p>
              <p className="text-sm font-bold text-green-600 mt-0.5">{byWarning["none"] || 0}</p>
            </div>
            <div className="px-2 py-3 text-center">
              <p className="text-[10px] text-gray-400">At Risk</p>
              <p className={`text-sm font-bold mt-0.5 ${atRisk.length > 0 ? "text-red-500" : "text-gray-800"}`}>{atRisk.length}</p>
            </div>
            <div className="px-2 py-3 text-center">
              <p className="text-[10px] text-gray-400">Harvest</p>
              <p className={`text-sm font-bold mt-0.5 ${harvestReady.length > 0 ? "text-amber-500" : "text-gray-800"}`}>{harvestReady.length}</p>
            </div>
          </div>
        </div>

        {/* Charts dropdown */}
        {plots.length > 0 && (
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
                  <p className="text-[10px] text-gray-400 mb-1 text-center">Plots by Growth Stage</p>
                  <div className="h-32">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={stagePieData} cx="50%" cy="50%" innerRadius={30} outerRadius={50} dataKey="value" strokeWidth={0}>
                          {stagePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                        </Pie>
                        <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex flex-wrap justify-center gap-2 text-[9px]">
                    {stagePieData.map((d, i) => (
                      <span key={d.name} className="flex items-center gap-1">
                        <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.name} ({d.value})
                      </span>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* Plots datatable */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Plots</span>
            <span className="text-[10px] text-gray-400">{plots.length} total</span>
          </div>
          {/* Column headers */}
          <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 text-[10px] text-gray-400 font-medium">
            <span className="w-6 text-center">ID</span>
            <span className="flex-1">Crop</span>
            <span className="w-16">Stage</span>
            <span className="w-10 text-right">Prog</span>
            <span className="w-12 text-right">Status</span>
            <span className="w-3" />
          </div>
          {plots.map((plot) => {
            const progress = Math.round(getProgress(plot.planted_date, plot.expected_harvest) * 100);
            const isExpanded = expandedPlot === plot.id;
            return (
              <div key={plot.id} className="border-b border-gray-50 last:border-0">
                <button onClick={() => setExpandedPlot(isExpanded ? null : plot.id)}
                  className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/50 transition-colors text-left">
                  <span className="text-[10px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono w-6 text-center flex-shrink-0">{plot.label}</span>
                  <span className="flex-1 text-xs text-gray-800 font-medium truncate">{plot.crop_name}</span>
                  <span className="text-[10px] text-gray-500 w-16 capitalize truncate">{plot.growth_stage}</span>
                  <span className="text-[10px] text-gray-500 w-10 text-right">{progress}%</span>
                  <span className={`text-[10px] font-medium w-12 text-right capitalize ${WARNING_CLS[plot.warning_level] || "text-gray-500"}`}>
                    {plot.warning_level === "none" ? "OK" : plot.warning_level}
                  </span>
                  <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
                    <ChevronDown size={12} className="text-gray-300" />
                  </motion.div>
                </button>
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                      className="border-t border-gray-50 bg-gray-50/30 px-3 pb-2.5 pt-2 text-xs space-y-1">
                      {plot.planted_date && <div className="flex justify-between"><span className="text-gray-400">Planted</span><span className="text-gray-700">{new Date(plot.planted_date).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</span></div>}
                      {plot.expected_harvest && <div className="flex justify-between"><span className="text-gray-400">Expected Harvest</span><span className="text-gray-700">{new Date(plot.expected_harvest).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}</span></div>}
                      <div className="flex justify-between"><span className="text-gray-400">Growth</span><span className="text-gray-700">{progress}% complete</span></div>
                      <div className="flex justify-between"><span className="text-gray-400">Warning</span><span className={WARNING_CLS[plot.warning_level] || "text-gray-500"}>{plot.warning_level === "none" ? "None — healthy" : plot.warning_level}</span></div>
                      <div className="flex gap-2 pt-1">
                        <button onClick={() => router.push(`/inspection?plot_id=${plot.id}`)} className="flex-1 text-[10px] text-center py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100">Inspect</button>
                        {plot.growth_stage === "harvest_ready" && <button onClick={() => handleHarvest(plot.id)} className="flex-1 text-[10px] text-center py-1.5 rounded bg-amber-500 text-white font-medium">Harvest</button>}
                        <button onClick={() => router.push(`/planting/${plot.id}`)} className="flex-1 text-[10px] text-center py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-100">Planting</button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plot bottom sheet */}
      {selectedPlot && (
        <PlotBottomSheet
          plot={selectedPlot}
          onClose={() => store.setSelectedPlot(null)}
          onHarvest={handleHarvest}
        />
      )}
    </div>
  );
}
