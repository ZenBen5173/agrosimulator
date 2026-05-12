"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronRight,
  AlertTriangle,
  Wind,
  Droplets,
  ThumbsUp,
  Minus,
  ThumbsDown,
  Package,
  Stethoscope,
  Receipt,
  Users,
  Sparkles,
} from "lucide-react";
import CoachMarks from "@/components/ui/CoachMarks";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import FarmSwitcher from "@/components/home/FarmSwitcher";
import NotificationBell from "@/components/NotificationBell";
import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";
import toast from "react-hot-toast";

// ── Interfaces ──

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

// ── Constants ──

const PRIORITY_BADGE: Record<string, { label: string; cls: string }> = {
  urgent: { label: "URG", cls: "bg-red-100 text-red-700" },
  normal: { label: "NRM", cls: "bg-amber-50 text-amber-600" },
  low: { label: "LOW", cls: "bg-stone-100 text-stone-500" },
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
  const [showTour, setShowTour] = useState(false);
  // prepList + alerts are retained as state (filled by data layer below) so we
  // can re-introduce their UI surfaces in a later iteration without changing
  // the loading code. They're intentionally not rendered in the current 2.0 home.
  void prepList; void alerts; void setPrepList; void setAlerts;

  // Start tour if ?tour=1 param present (from landing page)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("tour") === "1") {
      const timer = setTimeout(() => setShowTour(true), 1200);
      return () => clearTimeout(timer);
    }
  }, []);

  // If ?reset=1 (from "Reset to baseline + enter" on landing), wipe + reseed
  // demo data, then strip the param and reload so the page picks up the seed.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("reset") !== "1") return;
    (async () => {
      try {
        const res = await fetch("/api/demo/reset", { method: "POST" });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          toast.error(`Reset failed: ${data?.error ?? res.statusText}`);
        } else {
          toast.success("Demo data reset to baseline");
        }
      } catch {
        toast.error("Reset failed (network)");
      }
      params.delete("reset");
      const next = window.location.pathname + (params.toString() ? `?${params.toString()}` : "");
      window.location.replace(next);
    })();
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
          // 2.0: skip the legacy risk recalc — handled by Care layer plot-specific risk now
        } else {
          fetch(`/api/tasks/list?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => { if (d?.tasks) store.setTasks(d.tasks); }).catch(() => {});
        }

        // 2.0: prep-list and farm_alerts are cut features — UI sections render empty when state stays []
        fetch(`/api/inventory?farm_id=${farmRow.id}`).then((r) => r.ok ? r.json() : null).then((d) => {
          if (d && Array.isArray(d)) {
            setInventory(d);
            setLowStock(d.filter((i: InventoryItem) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold).slice(0, 5));
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

  const handleFollowUp = useCallback(async (followupId: string, status: "better" | "same" | "worse") => {
    try {
      await fetch("/api/diagnosis/v2/followup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ followupId, status }),
      });
      setTreatments((prev) => prev.filter((t) => t.id !== followupId));
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
          <AlertTriangle size={40} className="mx-auto mb-3 text-gray-300" />
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

  // Find the most urgent plot for the hero card (red > orange > yellow > none)
  const urgentPlot = (() => {
    const ranked = [...plots].sort((a, b) => {
      const order: Record<string, number> = { red: 3, orange: 2, yellow: 1, none: 0 };
      return (order[b.warning_level ?? "none"] ?? 0) - (order[a.warning_level ?? "none"] ?? 0);
    });
    return ranked[0]?.warning_level && ranked[0].warning_level !== "none" ? ranked[0] : null;
  })();

  const quickLinks = [
    { label: "Inspect", desc: "Plant doctor", href: "/inspection/v2", icon: Stethoscope },
    { label: "Receipt", desc: "Scan a bill", href: "/receipts", icon: Receipt },
    { label: "Pact", desc: "Prices + group buys", href: "/market", icon: Users },
    { label: "Books", desc: "Inventory + sales", href: "/inventory", icon: Package },
  ];

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      {/* ── Header ── */}
      <header className="sticky top-0 z-20 border-b border-stone-200 bg-white/90 backdrop-blur-lg px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          {farms.length > 1 ? <FarmSwitcher /> : (
            <div>
              <h1 className="text-lg font-semibold text-stone-900">Today</h1>
              <p className="text-[11px] text-stone-500 leading-none">{farm?.name ?? "Your farm"}</p>
            </div>
          )}
          <NotificationBell />
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 space-y-8">

        {/* ── Today summary (AI + most-urgent plot, grouped together) ── */}
        {(dailySummary || urgentPlot) && (
          <section className="space-y-3">
            <p className="px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Today
            </p>

            {dailySummary && (
              <div data-tour="ai-summary" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
                <div className="mb-1 flex items-center gap-2 text-[10px] uppercase tracking-wide text-emerald-700">
                  <Sparkles size={12} />
                  <span className="font-semibold">AI Summary</span>
                  <span className="ml-auto text-[10px] font-normal normal-case text-stone-400">
                    via Vertex AI
                  </span>
                </div>
                <p className="text-sm leading-relaxed text-stone-800">{dailySummary}</p>
              </div>
            )}

            {urgentPlot && (
              <button
                onClick={() => router.push(`/inspection/v2?plot_id=${urgentPlot.id}`)}
                className="block w-full rounded-xl border border-amber-300 bg-amber-50 p-4 text-left transition hover:border-amber-400"
              >
                <div className="mb-1 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-amber-700" />
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">
                    Needs your attention
                  </span>
                </div>
                <h2 className="text-base font-semibold text-stone-900">
                  {urgentPlot.label}: {urgentPlot.crop_name}
                </h2>
                {urgentPlot.warning_level === "yellow" && (
                  <p className="mt-0.5 text-xs text-stone-700">
                    Anthracnose risk after recent rain — inspect today.
                  </p>
                )}
                {urgentPlot.warning_level === "orange" && (
                  <p className="mt-0.5 text-xs text-stone-700">
                    Elevated disease risk — please inspect.
                  </p>
                )}
                {urgentPlot.warning_level === "red" && (
                  <p className="mt-0.5 text-xs text-stone-700">
                    Critical risk — inspect immediately.
                  </p>
                )}
                <div className="mt-3 inline-flex items-center gap-1 rounded-lg bg-stone-900 px-3 py-1.5 text-xs font-medium text-white">
                  Inspect now <ChevronRight size={14} />
                </div>
              </button>
            )}
          </section>
        )}

        {/* ── Shortcuts (separate conceptual section from Today) ── */}
        <section data-tour="quick-links">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Shortcuts
          </p>
          <div className="grid grid-cols-2 gap-2">
            {quickLinks.map((link) => {
              const Icon = link.icon;
              return (
                <button
                  key={link.label}
                  onClick={() => router.push(link.href)}
                  className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-3 text-left transition hover:border-emerald-400"
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50">
                    <Icon size={18} className="text-emerald-700" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-stone-800">{link.label}</span>
                    <span className="block truncate text-[11px] text-stone-500">{link.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Weather (its own little section so it visually sits apart) ── */}
        {weather && (
          <section>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Weather
            </p>
            <button
              data-tour="weather"
              onClick={() => router.push("/weather")}
              className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white p-4 text-left transition hover:border-emerald-400"
            >
              <div className="flex items-baseline gap-2">
                <span className="text-2xl font-semibold text-stone-900">
                  {Math.round(weather.temp_celsius)}°
                </span>
                <span className="text-sm capitalize text-stone-600">
                  {weather.condition}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-stone-500">
                <span className="flex items-center gap-1">
                  <Droplets size={12} /> {Math.round(weather.humidity_pct)}%
                </span>
                <span className="flex items-center gap-1">
                  <Wind size={12} /> {Math.round(weather.wind_kmh)}
                </span>
                <ChevronRight size={14} className="text-stone-300" />
              </div>
            </button>
          </section>
        )}
        {/* ── Resources Needed Today (1.0 prep-list, only renders if prepList loaded) ── */}
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
            <button onClick={() => router.push("/inventory")} className="w-full px-3 py-2 text-[11px] text-green-600 font-medium text-left border-t border-gray-100 hover:bg-gray-50">
              View full inventory
            </button>
          </div>
        )}

        {/* ── Tasks ── */}
        <section data-tour="tasks">
          <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
            Tasks
          </p>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
          <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-stone-800">Today&apos;s tasks</h2>
              {urgentCount > 0 && (
                <span className="rounded bg-red-50 px-1.5 py-0.5 text-[10px] font-medium text-red-700">
                  {urgentCount} urgent
                </span>
              )}
            </div>
            <span className="text-xs text-stone-400">{incompleteTasks.length} remaining</span>
          </div>

          {incompleteTasks.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-stone-400">All clear today.</div>
          ) : (
            <ul className="divide-y divide-stone-100">
              {incompleteTasks.slice(0, 8).map((task) => {
                const badge = PRIORITY_BADGE[task.priority] || PRIORITY_BADGE.normal;
                const isUrgent = task.priority === "urgent";
                return (
                  <li key={task.id} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-stone-50">
                    <button
                      onClick={(e) => handleCompleteTask(task.id, e)}
                      className="flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-[1.5px] border-stone-300 transition-colors hover:border-emerald-500 hover:bg-emerald-50"
                      aria-label={`Mark ${task.title} as done`}
                    >
                      <CheckCircle2 size={10} className="text-transparent" />
                    </button>
                    <div className="min-w-0 flex-1">
                      <p className={`text-sm leading-snug ${isUrgent ? "font-medium text-stone-900" : "text-stone-700"}`}>
                        {task.title}
                      </p>
                      {task.description && (
                        <p className="mt-0.5 truncate text-[11px] text-stone-500">{task.description}</p>
                      )}
                    </div>
                    {task.plot_label && (
                      <span className="flex-shrink-0 rounded bg-stone-100 px-1.5 py-0.5 font-mono text-[10px] text-stone-500">
                        {task.plot_label}
                      </span>
                    )}
                    <span className={`flex-shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium ${badge.cls}`}>
                      {badge.label}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
          </div>
        </section>

        {/* ── Treatment follow-ups ── */}
        {treatments.length > 0 && (
          <section>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Treatment check-ins
            </p>
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50 p-4">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-amber-800">
              5-day follow-up — better, same, or worse?
            </div>
            {treatments.map((t) => (
              <div key={t.id} className="rounded-lg bg-white p-3">
                <p className="mb-2 text-sm font-medium text-stone-800">
                  {t.plots?.label}: {t.diagnosis_name || "Treatment check"}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {(["better", "same", "worse"] as const).map((status) => {
                    const cfg = {
                      better: { icon: ThumbsUp, cls: "bg-emerald-600 hover:bg-emerald-700" },
                      same: { icon: Minus, cls: "bg-amber-500 hover:bg-amber-600" },
                      worse: { icon: ThumbsDown, cls: "bg-red-500 hover:bg-red-600" },
                    }[status];
                    const Icon = cfg.icon;
                    return (
                      <button
                        key={status}
                        onClick={() => handleFollowUp(t.id, status)}
                        className={`flex items-center justify-center gap-1 rounded-lg py-2 text-xs font-medium text-white transition ${cfg.cls}`}
                      >
                        <Icon size={12} />
                        <span className="capitalize">{status}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            </div>
          </section>
        )}

        {/* ── Low Stock ── */}
        {lowStock.length > 0 && (
          <section>
            <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Inventory
            </p>
            <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
              <div className="flex items-center gap-2">
                <Package size={14} className="text-amber-500" />
                <h2 className="text-sm font-semibold text-stone-800">Running low</h2>
              </div>
              <button
                onClick={() => router.push("/inventory")}
                className="text-xs font-medium text-emerald-700 hover:underline"
              >
                View all
              </button>
            </div>
            <ul className="divide-y divide-stone-100">
              {lowStock.map((item, i) => (
                <li
                  key={i}
                  className="flex items-center justify-between px-4 py-2.5 text-sm"
                >
                  <span className="text-stone-700">{item.item_name}</span>
                  <span className="font-medium text-red-600">
                    {item.current_quantity} {item.unit}
                  </span>
                </li>
              ))}
            </ul>
            </div>
          </section>
        )}

      </main>

      {/* Tour overlay */}
      {showTour && (
        <CoachMarks onComplete={() => setShowTour(false)} />
      )}
    </div>
  );
}
