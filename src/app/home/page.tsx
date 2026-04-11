"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Thermometer,
  Wind,
  Droplets,
  Sun,
  Clock,
  ThumbsUp,
  Minus,
  ThumbsDown,
  Bell,
  Package,
  BarChart3,
  Activity,
  ChevronDown,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import FarmSwitcher from "@/components/home/FarmSwitcher";
import NotificationBell from "@/components/NotificationBell";
import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";
import type { TaskData } from "@/types/farm";
import toast from "react-hot-toast";

// ── Interfaces ──

interface WeatherData {
  condition: string;
  temp_celsius: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_kmh: number;
  uv_index?: number;
  forecast: { date: string; condition: string; temp_min: number; temp_max: number; rain_chance: number }[];
}

interface PlotResourceNeed {
  label: string;
  crop_name: string;
  fertilizer_type: string | null;
  fertilizer_grams: number;
  fertilizer_due: boolean;
  pesticide_type: string | null;
  pesticide_ml: number;
  pesticide_due: boolean;
  water_litres: number;
  skip_water: boolean;
}

interface PrepListFull {
  total_water_litres: number;
  total_fertilizer_items: { type: string; grams: number }[];
  total_pesticide_items: { type: string; ml: number }[];
  total_estimated_cost_rm: number;
  total_labour_minutes: number;
  plots: PlotResourceNeed[];
}

interface InventoryItem {
  item_name: string;
  current_quantity: number;
  unit: string;
  reorder_threshold: number | null;
}

interface FarmAlert {
  id: string;
  title: string;
  summary: string;
  severity: string;
  alert_type: string;
  recommended_action: string | null;
}

interface DiagnosisSession {
  id: string;
  diagnosis_name: string | null;
  follow_up_status: string;
  follow_up_due: string | null;
  plots: { label: string; crop_name: string } | null;
}

// ── Constants (no emojis) ──

const CONDITION_LABEL: Record<string, string> = {
  sunny: "Sunny", overcast: "Cloudy", rainy: "Rainy", thunderstorm: "Storm", drought: "Drought", flood_risk: "Flood Risk",
};

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  urgent: { label: "URG", cls: "bg-red-100 text-red-700" },
  normal: { label: "NRM", cls: "bg-amber-50 text-amber-600" },
  low: { label: "LOW", cls: "bg-gray-100 text-gray-500" },
};

// ── Gauge bar component ──

function Gauge({ value, max, color, label, icon: Icon }: { value: number; max: number; color: string; label: string; icon: typeof Thermometer }) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="flex items-center gap-2 text-xs">
      <Icon size={13} className="text-gray-400 flex-shrink-0" />
      <span className="w-14 text-gray-500 truncate">{label}</span>
      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-8 text-right font-medium text-gray-700">{value}</span>
    </div>
  );
}

// ── Main ──

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useFarmStore();
  const { farm, farms, plots, weather, tasks } = store;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [prepList, setPrepList] = useState<PrepListFull | null>(null);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [alerts, setAlerts] = useState<FarmAlert[]>([]);
  const [treatments, setTreatments] = useState<DiagnosisSession[]>([]);
  const [lowStock, setLowStock] = useState<InventoryItem[]>([]);
  const [expandedTask, setExpandedTask] = useState<string | null>(null);

  // ── Data Loading ──
  useEffect(() => {
    async function load() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { router.replace("/"); return; }

        const { data: allFarms } = await supabase
          .from("farms")
          .select("id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box")
          .eq("onboarding_done", true)
          .order("created_at", { ascending: false });

        if (!allFarms || allFarms.length === 0) { router.replace("/onboarding"); return; }

        store.setFarms(allFarms);
        const prevFarmId = store.farm?.id;
        const farmRow = (prevFarmId && allFarms.find((f) => f.id === prevFarmId)) || allFarms[0];
        store.setFarm(farmRow);

        const [plotsRes, pricesApiRes] = await Promise.all([
          supabase.from("plots")
            .select("id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url")
            .eq("farm_id", farmRow.id),
          fetch("/api/market-prices").then((r) => r.ok ? r.json() : { prices: [] }),
        ]);

        store.setPlots(plotsRes.data || []);
        store.setMarketPrices(pricesApiRes.prices || []);
        setLoading(false);

        // Non-blocking fetches
        fetch(`/api/weather?farm_id=${farmRow.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) store.setWeather(d); })
          .catch(() => {});

        const AI_THROTTLE_KEY = "agro_ai_last_run";
        const lastRun = sessionStorage.getItem(AI_THROTTLE_KEY);
        const now = Date.now();
        const shouldRunAI = !lastRun || now - Number(lastRun) > 30 * 60 * 1000;

        if (shouldRunAI) {
          sessionStorage.setItem(AI_THROTTLE_KEY, String(now));
          fetch("/api/tasks/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ farm_id: farmRow.id }) })
            .then((r) => r.ok ? r.json() : null).then((d) => { if (d?.tasks) store.setTasks(d.tasks); }).catch(() => {});
          fetch("/api/plots/recalculate-risk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ farm_id: farmRow.id }) }).catch(() => {});
        } else {
          fetch(`/api/tasks/list?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d?.tasks) store.setTasks(d.tasks); }).catch(() => {});
        }

        fetch(`/api/prep-list?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d) setPrepList(d); }).catch(() => {});
        fetch(`/api/inventory?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d && Array.isArray(d)) {
            setInventory(d);
            setLowStock(d.filter((i: InventoryItem) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold).slice(0, 5));
          }
        }).catch(() => {});
        fetch(`/api/alerts?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d && Array.isArray(d)) setAlerts(d.filter((a: FarmAlert) => a.severity === "critical" || a.severity === "high").slice(0, 3)); }).catch(() => {});
        fetch(`/api/diagnosis?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d && Array.isArray(d)) {
            const today = new Date().toISOString().split("T")[0];
            setTreatments(d.filter((s: DiagnosisSession) => s.follow_up_due && s.follow_up_due <= today && s.follow_up_status === "pending").slice(0, 3));
          }
        }).catch(() => {});
      } catch (err) {
        console.error("Failed to load farm:", err);
        setLoading(false);
        setLoadError(true);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCompleteTask = useCallback(async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch("/api/tasks/complete", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ task_id: taskId }) });
      if (res.ok) { store.removeTask(taskId); toast.success("Task done"); }
    } catch { toast.error("Failed"); }
  }, [store]);

  const handleFollowUp = useCallback(async (sessionId: string, status: "better" | "same" | "worse") => {
    try {
      await fetch("/api/diagnosis", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ session_id: sessionId, status }) });
      setTreatments((prev) => prev.filter((t) => t.id !== sessionId));
      if (status === "better") toast.success("Treatment worked");
      else if (status === "same") toast("Recheck scheduled");
      else toast.error("Escalating to expert");
    } catch { toast.error("Failed"); }
  }, []);

  // ── Loading / Error ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-14">
        <SkeletonLine className="h-5 w-32 mb-4" />
        <SkeletonCard className="h-24 mb-3" />
        <SkeletonCard className="h-20 mb-3" />
        <SkeletonCard className="h-32 mb-3" />
      </div>
    );
  }

  if (loadError || !farm) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <AlertCircle size={40} className="mx-auto mb-3 text-gray-300" />
          <p className="text-base text-gray-600">{loadError ? "Unable to load your farm." : "No farm found."}</p>
          <button onClick={() => loadError ? window.location.reload() : router.push("/onboarding")} className="mt-4 rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white">
            {loadError ? "Retry" : "Set up farm"}
          </button>
        </div>
      </div>
    );
  }

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const urgentCount = incompleteTasks.filter((t) => t.priority === "urgent").length;

  // Aggregate prep resources by item
  const resourceRows: { name: string; needed: string; stock: string | null; isLow: boolean }[] = [];
  if (prepList) {
    for (const f of prepList.total_fertilizer_items) {
      const inv = inventory.find((i) => i.item_name.toLowerCase().includes(f.type.toLowerCase().split(" ")[0]));
      const isLow = inv ? (inv.reorder_threshold ? inv.current_quantity <= inv.reorder_threshold : false) : false;
      resourceRows.push({ name: f.type, needed: `${f.grams}g`, stock: inv ? `${inv.current_quantity} ${inv.unit}` : null, isLow });
    }
    for (const p of prepList.total_pesticide_items) {
      const inv = inventory.find((i) => i.item_name.toLowerCase().includes(p.type.toLowerCase().split(" ")[0]));
      const isLow = inv ? (inv.reorder_threshold ? inv.current_quantity <= inv.reorder_threshold : false) : false;
      resourceRows.push({ name: p.type, needed: `${p.ml}ml`, stock: inv ? `${inv.current_quantity} ${inv.unit}` : null, isLow });
    }
    if (prepList.total_water_litres > 0) {
      resourceRows.push({ name: "Water", needed: `${prepList.total_water_litres}L`, stock: null, isLow: false });
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          {farms.length > 1 ? <FarmSwitcher /> : (
            <h1 className="text-base font-semibold text-gray-900">{farm.name || "My Farm"}</h1>
          )}
          <NotificationBell />
        </div>
      </div>

      <div className="px-4 pt-3 space-y-3">

        {/* ── Alert Banner ── */}
        {alerts.length > 0 && (
          <button onClick={() => router.push("/alerts")} className="w-full rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 flex items-center gap-2 text-left">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0" />
            <span className="text-xs font-semibold text-red-700 flex-1 truncate">{alerts[0].title}</span>
            <span className="text-[10px] text-red-500 font-medium">{alerts.length}</span>
            <ChevronRight size={14} className="text-red-400" />
          </button>
        )}

        {/* ── Weather — Today Only ── */}
        {weather && (
          <button onClick={() => router.push("/weather")} className="w-full text-left rounded-lg border border-gray-200 bg-white p-3">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Today&apos;s Weather</span>
              <ChevronRight size={14} className="text-gray-300" />
            </div>
            <div className="flex items-start gap-4">
              {/* Left: temp + condition */}
              <div>
                <p className="text-3xl font-bold text-gray-900 leading-none">{weather.temp_celsius}&deg;</p>
                <p className="text-xs text-gray-500 mt-1">{CONDITION_LABEL[weather.condition] || weather.condition}</p>
                {weather.rainfall_mm > 0 && (
                  <p className="text-[10px] text-blue-500 mt-0.5">{weather.rainfall_mm}mm rain</p>
                )}
              </div>
              {/* Right: gauges */}
              <div className="flex-1 space-y-1.5">
                <Gauge value={weather.humidity_pct} max={100} color="bg-blue-400" label="Humidity" icon={Droplets} />
                <Gauge value={weather.wind_kmh} max={40} color="bg-teal-400" label="Wind" icon={Wind} />
                {(weather as WeatherData).uv_index !== undefined && (
                  <Gauge value={(weather as WeatherData).uv_index!} max={11} color="bg-amber-400" label="UV" icon={Sun} />
                )}
              </div>
            </div>
            {/* Today's conditions summary */}
            {weather.forecast && weather.forecast.length > 0 && (() => {
              const todayForecast = weather.forecast[0];
              return todayForecast ? (
                <div className="mt-3 pt-2 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                  <span>Today: {todayForecast.temp_min}&deg;&ndash;{todayForecast.temp_max}&deg;C</span>
                  <span>{todayForecast.rain_chance}% rain chance</span>
                  <span className="text-green-600 font-medium">Details &rarr;</span>
                </div>
              ) : null;
            })()}
          </button>
        )}

        {/* ── Resources Needed Today ── */}
        {resourceRows.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Resources Needed Today</span>
              <span className="text-xs font-semibold text-gray-700">RM{prepList?.total_estimated_cost_rm.toFixed(2)}</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-50">
                  <th className="text-left font-medium px-3 py-1.5">Item</th>
                  <th className="text-right font-medium px-3 py-1.5">Need</th>
                  <th className="text-right font-medium px-3 py-1.5">Stock</th>
                </tr>
              </thead>
              <tbody>
                {resourceRows.map((r, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-gray-700 font-medium">
                      <div className="flex items-center gap-1.5">
                        {r.isLow && <span className="w-1.5 h-1.5 rounded-full bg-red-500 flex-shrink-0" />}
                        {r.name}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-600">{r.needed}</td>
                    <td className={`px-3 py-2 text-right ${r.isLow ? "text-red-500 font-medium" : "text-gray-400"}`}>
                      {r.stock || "--"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button onClick={() => router.push("/prep")} className="w-full px-3 py-2 text-[11px] text-green-600 font-medium text-left border-t border-gray-100 hover:bg-gray-50">
              View full breakdown per plot
            </button>
          </div>
        )}

        {/* ── Tasks — Compact Datatable ── */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tasks</span>
              {urgentCount > 0 && (
                <span className="text-[9px] font-bold text-red-600 bg-red-50 px-1.5 py-0.5 rounded">{urgentCount} urgent</span>
              )}
            </div>
            <span className="text-[10px] text-gray-400">{incompleteTasks.length} remaining</span>
          </div>

          {incompleteTasks.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-gray-400">No tasks for today</div>
          ) : (
            <div>
              {incompleteTasks.slice(0, 10).map((task) => {
                const badge = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.normal;
                const isExpanded = expandedTask === task.id;
                const taskExt = task as TaskData & { resource_item?: string; resource_quantity?: number; resource_unit?: string; timing_recommendation?: string };
                return (
                  <div key={task.id} className="border-b border-gray-50 last:border-0">
                    <div
                      className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50/50 transition-colors"
                      onClick={() => setExpandedTask(isExpanded ? null : task.id)}
                    >
                      {/* Checkbox */}
                      <button
                        onClick={(e) => handleCompleteTask(task.id, e)}
                        className="w-5 h-5 rounded-full border-[1.5px] border-gray-300 flex items-center justify-center flex-shrink-0 hover:border-green-500 hover:bg-green-50 transition-colors"
                      >
                        <CheckCircle2 size={10} className="text-transparent" />
                      </button>
                      {/* Title */}
                      <span className="flex-1 text-xs text-gray-800 leading-snug">{task.title}</span>
                      {/* Plot label */}
                      {task.plot_label && (
                        <span className="text-[9px] text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded font-mono flex-shrink-0">{task.plot_label}</span>
                      )}
                      {/* Priority */}
                      <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
                      {/* Expand indicator */}
                      <motion.div animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
                        <ChevronDown size={12} className="text-gray-300" />
                      </motion.div>
                    </div>
                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: "auto", opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          className="px-3 pb-2 text-xs text-gray-500 border-t border-gray-50 bg-gray-50/30"
                        >
                          <p className="pt-2">{task.description}</p>
                          {taskExt.resource_item && (
                            <p className="mt-1 text-green-600 font-medium">
                              {taskExt.resource_quantity} {taskExt.resource_unit} {taskExt.resource_item}
                            </p>
                          )}
                          {taskExt.timing_recommendation && (
                            <p className="mt-0.5 text-gray-400">{taskExt.timing_recommendation}</p>
                          )}
                          <p className="mt-1 text-[10px] text-gray-300">Type: {task.task_type} | Triggered by: {task.triggered_by || "schedule"}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Active Treatments ── */}
        {treatments.length > 0 && (
          <div className="rounded-lg border border-amber-200 bg-amber-50/50 overflow-hidden">
            <div className="px-3 py-2 border-b border-amber-200 flex items-center gap-1.5">
              <Clock size={13} className="text-amber-500" />
              <span className="text-[10px] font-semibold text-amber-600 uppercase tracking-wider">Follow-up Due</span>
            </div>
            {treatments.map((t) => (
              <div key={t.id} className="px-3 py-2.5 border-b border-amber-100 last:border-0">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-800">{t.plots?.label}: {t.diagnosis_name || "Treatment check"}</span>
                  <span className="text-[10px] text-gray-400">{t.plots?.crop_name}</span>
                </div>
                <div className="flex gap-1.5">
                  {(["better", "same", "worse"] as const).map((status) => {
                    const cfg = { better: { icon: ThumbsUp, cls: "bg-green-600 text-white" }, same: { icon: Minus, cls: "bg-amber-500 text-white" }, worse: { icon: ThumbsDown, cls: "bg-red-500 text-white" } }[status];
                    const Icon = cfg.icon;
                    return (
                      <button key={status} onClick={() => handleFollowUp(t.id, status)}
                        className={`flex-1 ${cfg.cls} py-1.5 rounded text-[10px] font-medium flex items-center justify-center gap-1`}>
                        <Icon size={11} /> {status.charAt(0).toUpperCase() + status.slice(1)}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Low Stock ── */}
        {lowStock.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <div className="flex items-center gap-1.5">
                <Package size={13} className="text-amber-500" />
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Low Stock</span>
              </div>
              <button onClick={() => router.push("/inventory")} className="text-[10px] text-green-600 font-medium">View all</button>
            </div>
            {lowStock.map((item, i) => (
              <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0 text-xs">
                <span className="text-gray-700">{item.item_name}</span>
                <span className="text-red-500 font-medium">{item.current_quantity} {item.unit}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Quick Links ── */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          {[
            { label: "Market Prices", icon: BarChart3, href: "/market", cls: "text-indigo-600 bg-indigo-50 border-indigo-100" },
            { label: "All Alerts", icon: Bell, href: "/alerts", cls: "text-red-600 bg-red-50 border-red-100" },
            { label: "Activity", icon: Activity, href: "/activity", cls: "text-gray-600 bg-gray-50 border-gray-200" },
            { label: "Inventory", icon: Package, href: "/inventory", cls: "text-purple-600 bg-purple-50 border-purple-100" },
          ].map((link) => {
            const Icon = link.icon;
            return (
              <button key={link.label} onClick={() => router.push(link.href)}
                className={`flex-shrink-0 flex items-center gap-1.5 rounded-lg border ${link.cls} px-3 py-2`}>
                <Icon size={13} />
                <span className="text-[11px] font-medium whitespace-nowrap">{link.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
