"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  CloudSun,
  AlertTriangle,
  Droplets,
  Leaf,
  Bug,
  Clock,
  ThumbsUp,
  Minus,
  ThumbsDown,
  Bell,
  Package,
  BarChart3,
  Activity,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import FarmSwitcher from "@/components/home/FarmSwitcher";
import NotificationBell from "@/components/NotificationBell";
import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";
import type { PlotData, MarketPrice, TaskData } from "@/types/farm";
import toast from "react-hot-toast";

interface WeatherData {
  condition: string;
  temp_celsius: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_kmh: number;
  forecast: { date: string; condition: string; temp_min: number; temp_max: number; rain_chance: number }[];
}

interface PrepList {
  total_water_litres: number;
  total_fertilizer_items: { type: string; grams: number }[];
  total_pesticide_items: { type: string; grams?: number; ml: number }[];
  total_estimated_cost_rm: number;
  total_labour_minutes: number;
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

const WEATHER_EMOJI: Record<string, string> = {
  sunny: "☀️", overcast: "⛅", rainy: "🌧️", thunderstorm: "⛈️", drought: "🔥", flood_risk: "🌊",
};

const FORECAST_EMOJI: Record<string, string> = {
  sunny: "☀️", overcast: "⛅", rainy: "🌧️", thunderstorm: "⛈️", drought: "🔥", flood_risk: "🌊",
};

const TASK_EMOJI: Record<string, string> = {
  inspection: "🔍", watering: "💧", fertilizing: "🌱", treatment: "💊",
  harvesting: "🌾", replanting: "🔄", farm_wide: "🏡",
};

const PRIORITY_STYLE: Record<string, { bg: string; text: string }> = {
  urgent: { bg: "bg-red-100", text: "text-red-700" },
  normal: { bg: "bg-amber-100", text: "text-amber-700" },
  low: { bg: "bg-gray-100", text: "text-gray-500" },
};

const CONDITION_LABEL: Record<string, string> = {
  sunny: "Sunny", overcast: "Cloudy", rainy: "Rainy", thunderstorm: "Storm", drought: "Drought", flood_risk: "Flood Risk",
};

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();
  const store = useFarmStore();
  const { farm, farms, plots, weather, tasks, marketPrices } = store;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [prepList, setPrepList] = useState<PrepList | null>(null);
  const [alerts, setAlerts] = useState<FarmAlert[]>([]);
  const [treatments, setTreatments] = useState<DiagnosisSession[]>([]);
  const [lowStock, setLowStock] = useState<{ item_name: string; current_quantity: number; unit: string }[]>([]);
  const [prepExpanded, setPrepExpanded] = useState(false);

  // ── Data Loading (kept from original) ──
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

        // Parallel fetches
        const [plotsRes, pricesApiRes] = await Promise.all([
          supabase.from("plots")
            .select("id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url")
            .eq("farm_id", farmRow.id),
          fetch("/api/market-prices").then((r) => r.ok ? r.json() : { prices: [] }),
        ]);

        store.setPlots(plotsRes.data || []);
        store.setMarketPrices(pricesApiRes.prices || []);
        setLoading(false);

        // Non-blocking: weather, tasks, AI, prep list, alerts, treatments, inventory
        const weatherPromise = fetch(`/api/weather?farm_id=${farmRow.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) store.setWeather(d); })
          .catch(() => {});

        // Tasks + risk (throttled)
        const AI_THROTTLE_KEY = "agro_ai_last_run";
        const lastRun = sessionStorage.getItem(AI_THROTTLE_KEY);
        const now = Date.now();
        const shouldRunAI = !lastRun || now - Number(lastRun) > 30 * 60 * 1000;

        if (shouldRunAI) {
          sessionStorage.setItem(AI_THROTTLE_KEY, String(now));
          fetch("/api/tasks/generate", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ farm_id: farmRow.id }),
          }).then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.tasks) store.setTasks(d.tasks); })
            .catch(() => {});

          fetch("/api/plots/recalculate-risk", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ farm_id: farmRow.id }),
          }).catch(() => {});
        } else {
          fetch(`/api/tasks/list?farm_id=${farmRow.id}`)
            .then((r) => r.ok ? r.json() : null)
            .then((d) => { if (d?.tasks) store.setTasks(d.tasks); })
            .catch(() => {});
        }

        // Prep list
        fetch(`/api/prep-list?farm_id=${farmRow.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d) setPrepList(d); })
          .catch(() => {});

        // Alerts
        fetch(`/api/alerts?farm_id=${farmRow.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => { if (d && Array.isArray(d)) setAlerts(d.filter((a: FarmAlert) => a.severity === "critical" || a.severity === "high").slice(0, 3)); })
          .catch(() => {});

        // Active treatments
        fetch(`/api/diagnosis?farm_id=${farmRow.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            if (d && Array.isArray(d)) {
              const today = new Date().toISOString().split("T")[0];
              setTreatments(d.filter((s: DiagnosisSession) => s.follow_up_due && s.follow_up_due <= today && s.follow_up_status === "pending").slice(0, 3));
            }
          })
          .catch(() => {});

        // Low stock inventory
        fetch(`/api/inventory?farm_id=${farmRow.id}`)
          .then((r) => r.ok ? r.json() : null)
          .then((d) => {
            if (d && Array.isArray(d)) {
              setLowStock(d.filter((i: { reorder_threshold: number | null; current_quantity: number }) =>
                i.reorder_threshold && i.current_quantity <= i.reorder_threshold
              ).slice(0, 3));
            }
          })
          .catch(() => {});

        await weatherPromise;
      } catch (err) {
        console.error("Failed to load farm:", err);
        setLoading(false);
        setLoadError(true);
      }
    }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCompleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      });
      if (res.ok) { store.removeTask(taskId); toast.success("Task done!"); }
    } catch { toast.error("Failed to complete task"); }
  }, [store]);

  const handleFollowUp = useCallback(async (sessionId: string, status: "better" | "same" | "worse") => {
    try {
      await fetch("/api/diagnosis", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ session_id: sessionId, status }),
      });
      setTreatments((prev) => prev.filter((t) => t.id !== sessionId));
      if (status === "better") toast.success("Treatment worked!");
      else if (status === "same") toast("Recheck scheduled", { icon: "🔄" });
      else toast.error("Escalating to expert");
    } catch { toast.error("Failed"); }
  }, []);

  // ── Loading states ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-14">
        <SkeletonLine className="h-5 w-32 mb-4" />
        <SkeletonCard className="h-16 mb-3" />
        <SkeletonCard className="h-24 mb-3" />
        <SkeletonCard className="h-20 mb-3" />
        <SkeletonCard className="h-20 mb-3" />
        <SkeletonCard className="h-20" />
      </div>
    );
  }

  if (loadError || !farm) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50 px-6">
        <div className="text-center">
          <span className="mb-4 block text-4xl">😟</span>
          <p className="text-lg text-gray-600">{loadError ? "Unable to load your farm." : "No farm found."}</p>
          <button onClick={() => loadError ? window.location.reload() : router.push("/onboarding")} className="mt-4 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white">
            {loadError ? "Tap to retry" : "Set up farm"}
          </button>
        </div>
      </div>
    );
  }

  const incompleteTasks = tasks.filter((t) => !t.completed);
  const urgentTasks = incompleteTasks.filter((t) => t.priority === "urgent");

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* ── Header ── */}
      <div className="sticky top-0 z-20 bg-white/90 backdrop-blur-lg border-b border-gray-100 px-4 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {farms.length > 1 ? <FarmSwitcher /> : (
              <h1 className="text-lg font-bold text-gray-900">{farm.name || "My Farm"}</h1>
            )}
          </div>
          <div className="flex items-center gap-2">
            {weather && (
              <button onClick={() => router.push("/weather")} className="flex items-center gap-1.5 rounded-full bg-gray-100 px-3 py-1.5">
                <span className="text-sm">{WEATHER_EMOJI[weather.condition] || "🌤️"}</span>
                <span className="text-xs font-medium text-gray-700">{weather.temp_celsius}°</span>
              </button>
            )}
            <NotificationBell />
          </div>
        </div>
      </div>

      <div className="px-4 pt-4 space-y-4">

        {/* ── Alert Banner (conditional) ── */}
        {alerts.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-xl bg-red-50 border border-red-200 p-3"
          >
            <button onClick={() => router.push("/alerts")} className="w-full text-left">
              <div className="flex items-center gap-2 mb-1">
                <AlertTriangle size={16} className="text-red-500" />
                <span className="text-xs font-bold text-red-700 uppercase">{alerts.length} Alert{alerts.length > 1 ? "s" : ""}</span>
                <ChevronRight size={14} className="text-red-400 ml-auto" />
              </div>
              <p className="text-sm text-red-700 line-clamp-1">{alerts[0].title}</p>
            </button>
          </motion.div>
        )}

        {/* ── Weather Strip ── */}
        {weather && weather.forecast && weather.forecast.length > 0 && (
          <button onClick={() => router.push("/weather")} className="w-full text-left">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 no-scrollbar">
              {weather.forecast.slice(0, 5).map((day, i) => (
                <div key={i} className="flex-shrink-0 rounded-xl bg-white border border-gray-100 px-3 py-2 text-center min-w-[64px]">
                  <p className="text-[10px] text-gray-400 font-medium">
                    {new Date(day.date).toLocaleDateString("en", { weekday: "short" })}
                  </p>
                  <p className="text-lg my-0.5">{FORECAST_EMOJI[day.condition] || "🌤️"}</p>
                  <p className="text-[10px] text-gray-600 font-medium">{day.temp_min}–{day.temp_max}°</p>
                </div>
              ))}
            </div>
          </button>
        )}

        {/* ── Prep List Card ── */}
        {prepList && (prepList.total_water_litres > 0 || prepList.total_fertilizer_items.length > 0 || prepList.total_pesticide_items.length > 0) && (
          <div className="rounded-xl bg-white border border-gray-100 overflow-hidden">
            <button
              onClick={() => setPrepExpanded(!prepExpanded)}
              className="w-full px-4 py-3 flex items-center justify-between"
            >
              <div>
                <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Bring Today</p>
                <div className="flex items-center gap-3 mt-1">
                  {prepList.total_water_litres > 0 && (
                    <span className="flex items-center gap-1 text-sm text-blue-600 font-medium">
                      <Droplets size={14} /> {prepList.total_water_litres}L
                    </span>
                  )}
                  {prepList.total_fertilizer_items.map((f) => (
                    <span key={f.type} className="flex items-center gap-1 text-sm text-green-600 font-medium">
                      <Leaf size={14} /> {f.grams}g
                    </span>
                  ))}
                  {prepList.total_pesticide_items.map((p) => (
                    <span key={p.type} className="flex items-center gap-1 text-sm text-amber-600 font-medium">
                      <Bug size={14} /> {p.ml}ml
                    </span>
                  ))}
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-gray-800">RM{prepList.total_estimated_cost_rm.toFixed(2)}</p>
                <p className="text-[10px] text-gray-400">{prepList.total_labour_minutes}min work</p>
              </div>
            </button>
            <AnimatePresence>
              {prepExpanded && (
                <motion.div
                  initial={{ height: 0 }} animate={{ height: "auto" }} exit={{ height: 0 }}
                  className="border-t border-gray-100 px-4 pb-3"
                >
                  <button onClick={() => router.push("/prep")} className="mt-2 text-xs text-green-600 font-medium">
                    View full prep breakdown &rarr;
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        {/* ── Tasks ── */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <h2 className="text-sm font-bold text-gray-800">
              Today&apos;s Tasks
              {urgentTasks.length > 0 && (
                <span className="ml-2 inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-600">
                  {urgentTasks.length} urgent
                </span>
              )}
            </h2>
            <span className="text-xs text-gray-400">{incompleteTasks.length} remaining</span>
          </div>

          {incompleteTasks.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white p-6 text-center">
              <p className="text-sm text-gray-400">All caught up! No tasks for today.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {incompleteTasks.slice(0, 8).map((task) => {
                const pStyle = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.normal;
                return (
                  <motion.div
                    key={task.id}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3 rounded-xl bg-white border border-gray-100 px-3 py-3"
                  >
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-200 hover:border-green-500 hover:bg-green-50 transition-all active:scale-90"
                    >
                      <CheckCircle2 size={14} className="text-transparent" />
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{TASK_EMOJI[task.task_type] || "📋"}</span>
                        <p className="text-sm font-medium text-gray-800 truncate">{task.title}</p>
                      </div>
                      <p className="text-xs text-gray-400 line-clamp-1 mt-0.5">{task.description}</p>
                      {(task as TaskData & { resource_item?: string; resource_quantity?: number; resource_unit?: string }).resource_item && (
                        <p className="text-[10px] text-green-600 mt-0.5 font-medium">
                          {(task as TaskData & { resource_quantity?: number }).resource_quantity} {(task as TaskData & { resource_unit?: string }).resource_unit} {(task as TaskData & { resource_item?: string }).resource_item}
                        </p>
                      )}
                    </div>
                    <span className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${pStyle.bg} ${pStyle.text}`}>
                      {task.priority}
                    </span>
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Active Treatments (conditional) ── */}
        {treatments.length > 0 && (
          <div>
            <h2 className="text-sm font-bold text-gray-800 mb-2 flex items-center gap-1">
              <Clock size={14} className="text-amber-500" />
              Follow-up Due
            </h2>
            {treatments.map((t) => (
              <div key={t.id} className="rounded-xl bg-amber-50 border border-amber-200 p-3 mb-2">
                <p className="text-sm font-medium text-gray-800">
                  {t.plots?.label}: {t.diagnosis_name || "Treatment check"}
                </p>
                <p className="text-xs text-gray-500 mb-2">{t.plots?.crop_name}</p>
                <div className="flex gap-2">
                  {(["better", "same", "worse"] as const).map((status) => {
                    const cfg = { better: { icon: ThumbsUp, color: "bg-green-500", label: "Better" }, same: { icon: Minus, color: "bg-amber-500", label: "Same" }, worse: { icon: ThumbsDown, color: "bg-red-500", label: "Worse" } }[status];
                    const Icon = cfg.icon;
                    return (
                      <button key={status} onClick={() => handleFollowUp(t.id, status)}
                        className={`flex-1 ${cfg.color} text-white py-2 rounded-lg text-xs font-medium flex items-center justify-center gap-1`}>
                        <Icon size={12} /> {cfg.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── Low Stock (conditional) ── */}
        {lowStock.length > 0 && (
          <div className="rounded-xl bg-white border border-gray-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-gray-800 flex items-center gap-1">
                <Package size={14} className="text-amber-500" />
                Low Stock
              </h2>
              <button onClick={() => router.push("/inventory")} className="text-xs text-green-600 font-medium">View all</button>
            </div>
            {lowStock.map((item, i) => (
              <div key={i} className="flex items-center justify-between py-1.5 text-sm">
                <span className="text-gray-700">{item.item_name}</span>
                <span className="text-red-500 font-medium">{item.current_quantity} {item.unit}</span>
              </div>
            ))}
          </div>
        )}

        {/* ── Quick Links ── */}
        <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1 no-scrollbar">
          {[
            { label: "Market Prices", icon: BarChart3, href: "/market", color: "text-indigo-600 bg-indigo-50" },
            { label: "All Alerts", icon: Bell, href: "/alerts", color: "text-red-600 bg-red-50" },
            { label: "Activity Log", icon: Activity, href: "/activity", color: "text-gray-600 bg-gray-100" },
            { label: "Inventory", icon: Package, href: "/inventory", color: "text-purple-600 bg-purple-50" },
          ].map((link) => {
            const Icon = link.icon;
            return (
              <button key={link.label} onClick={() => router.push(link.href)}
                className={`flex-shrink-0 flex items-center gap-2 rounded-xl ${link.color} px-4 py-2.5`}>
                <Icon size={16} />
                <span className="text-xs font-medium whitespace-nowrap">{link.label}</span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
