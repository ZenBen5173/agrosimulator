"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  AlertCircle,
  Wind,
  Droplets,
  Clock,
  ThumbsUp,
  Minus,
  ThumbsDown,
  Package,
  ChevronDown,
  ScanLine,
  BarChart3,
  Bell,
  FileText,
  Activity,
  Wrench,
  CloudSun,
} from "lucide-react";
import AISummary from "@/components/ui/AISummary";
import CoachMarks from "@/components/ui/CoachMarks";
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
  const [showTour, setShowTour] = useState(false);

  // Start tour if ?tour=1 param present (from landing page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "1") {
      const timer = setTimeout(() => setShowTour(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

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

  // Build AI summary from available data
  const summaryParts: string[] = [];
  if (urgentCount > 0) {
    const urgentTitles = incompleteTasks.filter((t) => t.priority === "urgent").slice(0, 2).map((t) => t.title.toLowerCase());
    summaryParts.push(`${urgentCount} urgent task${urgentCount > 1 ? "s" : ""} today \u2014 ${urgentTitles.join(" and ")}`);
  } else if (incompleteTasks.length > 0) {
    summaryParts.push(`${incompleteTasks.length} tasks for today, none urgent`);
  }
  if (weather) {
    if (weather.condition === "rainy" || weather.condition === "thunderstorm") {
      summaryParts.push("rain expected, delay outdoor spraying");
    } else if (weather.condition === "sunny" && weather.temp_celsius > 33) {
      summaryParts.push("high heat today \u2014 water early morning to reduce evaporation");
    }
  }
  if (alerts.length > 0) summaryParts.push(alerts[0].title);
  if (lowStock.length > 0) summaryParts.push(`running low on ${lowStock[0].item_name}`);
  if (prepList && prepList.total_fertilizer_items.length > 0) {
    const topItems = prepList.total_fertilizer_items.slice(0, 2).map((f) => f.type.split(" (")[0]);
    summaryParts.push(`bring ${topItems.join(" and ")} from shed`);
  }
  const dailySummary = summaryParts.length > 0 ? summaryParts.join(". ") + "." : null;

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
            <h1 className="text-base font-semibold text-gray-900">Today</h1>
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

        {/* ── AI Summary ── */}
        {dailySummary && <div data-tour="ai-summary"><AISummary>{dailySummary}</AISummary></div>}

        {/* ── Quick Links ── */}
        <div data-tour="quick-links">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-2">Quick Links</p>
          <div className="flex gap-2 overflow-x-auto pb-1 -mx-4 px-4 no-scrollbar">
            {[
              { label: "Scan Doc", desc: "Photo a bill", href: "/accounts/scan", icon: ScanLine },
              { label: "Market", desc: "Crop prices", href: "/market", icon: BarChart3 },
              { label: "Alerts", desc: "Warnings", href: "/alerts", icon: Bell },
              { label: "Inventory", desc: "Stock levels", href: "/inventory", icon: Package },
              { label: "Documents", desc: "SO, PO, INV", href: "/business", icon: FileText },
              { label: "Activity", desc: "Farm events", href: "/activity", icon: Activity },
              { label: "Equipment", desc: "Depreciation", href: "/equipment", icon: Wrench },
              { label: "Weather", desc: "Full forecast", href: "/weather", icon: CloudSun },
            ].map((link) => {
              const Icon = link.icon;
              return (
                <button key={link.label} onClick={() => router.push(link.href)}
                  className="flex-shrink-0 w-24 rounded-lg border border-gray-200 bg-white px-3 py-2.5 text-left hover:bg-gray-50 transition-colors">
                  <Icon size={16} className="text-gray-400 mb-1.5" />
                  <p className="text-xs font-medium text-gray-800">{link.label}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">{link.desc}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Weather — Today Hourly ── */}
        {weather && (() => {
          const baseTemp = weather.temp_celsius;
          const hours = Array.from({ length: 24 }, (_, h) => {
            const curve = Math.sin(((h - 5) / 24) * Math.PI * 2) * 0.4 + 0.1;
            const temp = Math.round(baseTemp + curve * 6 - 3);
            const rainBase = weather.condition === "rainy" ? 60 : weather.condition === "thunderstorm" ? 80 : 10;
            const afternoonBoost = h >= 14 && h <= 18 ? 25 : 0;
            const rain = Math.min(100, Math.max(0, rainBase + afternoonBoost + Math.round((Math.sin(h * 0.7) * 15))));
            return { hour: h, temp, rain };
          });
          const now = new Date().getHours();
          const upcoming = hours.slice(now, Math.min(now + 12, 24));
          const temps = upcoming.map((h) => h.temp);
          const minT = Math.min(...temps) - 1;
          const maxT = Math.max(...temps) + 1;
          const range = maxT - minT;

          // Curve points: each column is 48px wide, chart is 60px tall
          const colW = 48;
          const chartH = 60;
          const pad = 6;
          const totalW = upcoming.length * colW;
          const curvePoints = upcoming.map((h, i) => {
            const x = i * colW + colW / 2;
            const y = pad + (chartH - 2 * pad) * (1 - (h.temp - minT) / range);
            return { x, y };
          });
          const polyline = curvePoints.map((p) => `${p.x},${p.y}`).join(" ");
          const polygon = `0,${chartH} ${polyline} ${totalW},${chartH}`;

          const fmt12 = (h: number) => h === now ? "Now" : h === 0 ? "12am" : h === 12 ? "12pm" : h > 12 ? `${h - 12}pm` : `${h}am`;

          return (
            <div data-tour="weather" className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-3 pt-2.5 pb-1.5">
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-bold text-gray-900">{weather.temp_celsius}&deg;</span>
                  <span className="text-xs text-gray-500">{CONDITION_LABEL[weather.condition] || weather.condition}</span>
                  {weather.rainfall_mm > 0 && <span className="text-[10px] text-blue-500">{weather.rainfall_mm}mm</span>}
                </div>
                <div className="flex items-center gap-3 text-[10px] text-gray-400">
                  <span className="flex items-center gap-1"><Droplets size={11} /> {weather.humidity_pct}%</span>
                  <span className="flex items-center gap-1"><Wind size={11} /> {weather.wind_kmh}</span>
                </div>
              </div>

              {/* Scrollable hourly strip with integrated curve */}
              <div className="overflow-x-auto no-scrollbar">
                <div style={{ width: totalW }} className="relative">
                  {/* SVG curve behind the columns */}
                  <svg width={totalW} height={chartH} className="absolute inset-0">
                    <defs>
                      <linearGradient id="tg" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.03" />
                      </linearGradient>
                    </defs>
                    <polygon points={polygon} fill="url(#tg)" />
                    <polyline points={polyline} fill="none" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    {curvePoints.map((p, i) => (
                      <circle key={i} cx={p.x} cy={p.y} r="2.5" fill="#f59e0b" />
                    ))}
                  </svg>

                  {/* Hour columns on top of curve */}
                  <div className="relative flex" style={{ height: chartH + 36 }}>
                    {upcoming.map((h, i) => (
                      <div key={h.hour} className="flex flex-col items-center justify-end" style={{ width: colW }}>
                        {/* Temp label above dot */}
                        <span
                          className="text-[10px] font-semibold text-gray-700"
                          style={{ marginBottom: chartH - curvePoints[i].y + 2 }}
                        >
                          {h.temp}&deg;
                        </span>
                        {/* spacer to push time label to bottom */}
                        <div className="flex-1" />
                        {/* Time label */}
                        <span className="text-[9px] text-gray-400 pb-1">{fmt12(h.hour)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* Link to full weather page */}
              <button onClick={() => router.push("/weather")} className="w-full px-3 py-2 text-[11px] text-green-600 font-medium text-left border-t border-gray-100 hover:bg-gray-50">
                View full forecast and spray conditions
              </button>
            </div>
          );
        })()}

        {/* ── Resources Needed Today ── */}
        {resourceRows.length > 0 && (
          <div data-tour="resources" className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Resources Needed Today</span>
                <span className="text-[8px] text-gray-300 bg-gray-50 px-1 py-0.5 rounded">Gemini</span>
              </div>
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
        <div data-tour="tasks" className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-gray-100">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Tasks</span>
              <span className="text-[8px] text-gray-300 bg-gray-50 px-1 py-0.5 rounded">Gemini</span>
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
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 text-[10px] text-gray-400 font-medium">
                <span className="w-5" />
                <span className="flex-1">Task</span>
                <span>Plot</span>
                <span className="w-8">Pri</span>
                <span className="w-3" />
              </div>
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

        {/* ── Follow-ups (treatments + unread chats + pending docs) ── */}
        {(treatments.length > 0 || alerts.length > 0) && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100 flex items-center gap-1.5">
              <Clock size={13} className="text-amber-500" />
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Follow-ups</span>
            </div>

            {/* Treatment follow-ups */}
            {treatments.map((t) => (
              <div key={t.id} className="px-3 py-2.5 border-b border-gray-50 last:border-0">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium text-gray-800">{t.plots?.label}: {t.diagnosis_name || "Treatment check"}</span>
                  <span className="text-[9px] text-amber-500 bg-amber-50 px-1.5 py-0.5 rounded font-medium">Treatment</span>
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

            {/* Alert follow-ups as navigable items */}
            {alerts.slice(0, 2).map((alert) => (
              <button key={alert.id} onClick={() => router.push("/alerts")}
                className="w-full px-3 py-2.5 border-b border-gray-50 last:border-0 flex items-center justify-between hover:bg-gray-50/50 text-left">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-800 truncate">{alert.title}</p>
                  <p className="text-[10px] text-gray-400 truncate mt-0.5">{alert.recommended_action || alert.summary}</p>
                </div>
                <span className="text-[9px] text-red-500 bg-red-50 px-1.5 py-0.5 rounded font-medium flex-shrink-0 ml-2">Alert</span>
              </button>
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

      </div>

      {/* Tour overlay */}
      {showTour && (
        <CoachMarks onComplete={() => setShowTour(false)} />
      )}
    </div>
  );
}
