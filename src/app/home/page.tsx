"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { motion } from "framer-motion";
import {
  Search,
  Clock,
  TrendingUp,
  TrendingDown,
  Minus,
  CheckCircle2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";
import PlotBottomSheet from "@/components/PlotBottomSheet";
import SummaryCards from "@/components/home/SummaryCards";
import PlotCardRow from "@/components/home/PlotCardRow";
import FarmSwitcher from "@/components/home/FarmSwitcher";
import NotificationBell from "@/components/NotificationBell";
import Card from "@/components/ui/Card";
import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";
import type { PlotData, MarketPrice, TaskData } from "@/types/farm";
import toast from "react-hot-toast";

const FarmMapView = dynamic(() => import("@/components/FarmMapView"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-gray-900">
      <p className="text-green-400">Loading map...</p>
    </div>
  ),
});

interface FarmRow {
  id: string;
  name: string | null;
  area_acres: number;
  grid_size: number;
  soil_type: string | null;
  water_source: string | null;
  polygon_geojson: GeoJSON.Polygon | null;
  bounding_box: {
    north: number;
    south: number;
    east: number;
    west: number;
  } | null;
}

interface ForecastDay {
  date: string;
  condition: string;
  temp_min: number;
  temp_max: number;
  rain_chance: number;
}

interface WeatherData {
  condition: string;
  temp_celsius: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_kmh: number;
  forecast: ForecastDay[];
}

const CONDITION_EMOJI: Record<string, string> = {
  sunny: "☀️",
  overcast: "⛅",
  rainy: "🌧️",
  thunderstorm: "⛈️",
  drought: "🔥",
  flood_risk: "🌊",
};

const CONDITION_LABEL: Record<string, string> = {
  sunny: "Sunny",
  overcast: "Cloudy",
  rainy: "Rainy",
  thunderstorm: "Storm",
  drought: "Drought",
  flood_risk: "Flood Risk",
};

const FORECAST_EMOJI: Record<string, string> = {
  sunny: "☀️",
  overcast: "⛅",
  rainy: "🌧️",
  thunderstorm: "⛈️",
  drought: "🔥",
  flood_risk: "🌊",
};

const TASK_TYPE_ICON: Record<string, string> = {
  inspection: "🔍",
  watering: "💧",
  fertilizing: "🌱",
  treatment: "💊",
  harvesting: "🌾",
  replanting: "🔄",
  farm_wide: "🏡",
};

const PRIORITY_STYLE: Record<
  string,
  { bg: string; text: string; label: string }
> = {
  urgent: { bg: "bg-red-100", text: "text-red-700", label: "Urgent" },
  normal: { bg: "bg-amber-100", text: "text-amber-700", label: "Normal" },
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "Low" },
};

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();

  // Global store
  const store = useFarmStore();
  const { farm, farms, plots, weather, tasks, marketPrices, selectedPlot, plotWarnings } =
    store;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [extraPolygons, setExtraPolygons] = useState<GeoJSON.Polygon[]>([]);
  const [zoneOverlays, setZoneOverlays] = useState<
    { label: string; crop: string; colour: string; polygon: GeoJSON.Polygon; warningLevel?: string }[]
  >([]);

  useEffect(() => {
    async function load() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.replace("/");
          return;
        }

        const { data: allFarms } = await supabase
          .from("farms")
          .select(
            "id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box"
          )
          .eq("onboarding_done", true)
          .order("created_at", { ascending: false });

        if (!allFarms || allFarms.length === 0) {
          router.replace("/onboarding");
          return;
        }

        store.setFarms(allFarms);

        // Select the previously active farm if it still exists, otherwise the first one
        const prevFarmId = store.farm?.id;
        const farmRow =
          (prevFarmId && allFarms.find((f) => f.id === prevFarmId)) ||
          allFarms[0];

        store.setFarm(farmRow);

        // Fetch plots, market prices, extra parcels, and zone polygons in parallel
        const [plotsRes, pricesApiRes, parcelsRes, zonesRes] = await Promise.all([
          supabase
            .from("plots")
            .select(
              "id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url"
            )
            .eq("farm_id", farmRow.id),
          fetch("/api/market-prices").then((r) =>
            r.ok ? r.json() : { prices: [] }
          ),
          supabase
            .from("farm_features")
            .select("geometry_geojson")
            .eq("farm_id", farmRow.id)
            .eq("feature_type", "parcel"),
          supabase
            .from("farm_zones")
            .select("zone_label, suggested_crop, crop_override, colour_hex, geometry_geojson")
            .eq("farm_id", farmRow.id)
            .order("zone_label"),
        ]);

        const plotRows: PlotData[] = plotsRes.data || [];
        store.setPlots(plotRows);

        // Extract extra parcel polygons for the map
        const parcelRows = parcelsRes.data || [];
        const polys = parcelRows
          .map((r: { geometry_geojson: unknown }) => r.geometry_geojson as GeoJSON.Polygon)
          .filter((g): g is GeoJSON.Polygon => !!g && typeof g === "object");
        setExtraPolygons(polys);

        // Build zone overlays (merge warning_level from plots)
        const zoneRows = zonesRes.data || [];
        const zOverlays = zoneRows
          .filter((z: { geometry_geojson: unknown }) => z.geometry_geojson)
          .map((z: { zone_label: string; suggested_crop: string; crop_override: string | null; colour_hex: string; geometry_geojson: unknown }) => {
            const matchingPlot = plotRows.find((p) => p.label === z.zone_label);
            return {
              label: z.zone_label,
              crop: z.crop_override || z.suggested_crop,
              colour: z.colour_hex,
              polygon: z.geometry_geojson as GeoJSON.Polygon,
              warningLevel: matchingPlot?.warning_level,
            };
          });
        setZoneOverlays(zOverlays);

        const prices: MarketPrice[] = pricesApiRes.prices || [];
        store.setMarketPrices(prices);
        setLoading(false);

        // Check if prices are stale (updated_at > 24h ago) and refresh
        const STALE_MS = 24 * 60 * 60 * 1000;
        const isStale =
          prices.length === 0 ||
          prices.some((p: MarketPrice) => {
            if (!p.updated_at) return true;
            return Date.now() - new Date(p.updated_at).getTime() > STALE_MS;
          });

        if (isStale) {
          try {
            const refreshRes = await fetch("/api/market-prices/refresh", {
              method: "POST",
            });
            if (refreshRes.ok) {
              const freshRes = await fetch("/api/market-prices");
              if (freshRes.ok) {
                const freshData = await freshRes.json();
                store.setMarketPrices(freshData.prices || []);
              }
            }
          } catch {
            // Non-critical — stale prices still usable
          }
        }

        // Non-blocking: weather
        try {
          const weatherRes = await fetch(
            `/api/weather?farm_id=${farmRow.id}`
          );
          if (weatherRes.ok) {
            const weatherData: WeatherData = await weatherRes.json();
            store.setWeather(weatherData);

            // Generate notifications from weather
            if (
              weatherData.condition === "thunderstorm" ||
              weatherData.condition === "flood_risk"
            ) {
              store.addNotification({
                type: "weather",
                title: "Weather Warning",
                message: `${CONDITION_LABEL[weatherData.condition] || weatherData.condition} conditions detected. Protect your crops.`,
              });
            }
          }
        } catch {
          // Non-critical
        }

        // Non-blocking: tasks + risk (throttled to once per session / 30 min)
        const AI_THROTTLE_KEY = "agro_ai_last_run";
        const lastRun = sessionStorage.getItem(AI_THROTTLE_KEY);
        const now = Date.now();
        const THROTTLE_MS = 30 * 60 * 1000; // 30 minutes
        const shouldRunAI = !lastRun || now - Number(lastRun) > THROTTLE_MS;

        const aiCalls: Promise<unknown>[] = [];

        if (shouldRunAI) {
          aiCalls.push(
            fetch("/api/tasks/generate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ farm_id: farmRow.id }),
            }).then((r) => (r.ok ? r.json() : null)),
            fetch("/api/plots/recalculate-risk", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ farm_id: farmRow.id }),
            }).then((r) => (r.ok ? r.json() : null))
          );
          sessionStorage.setItem(AI_THROTTLE_KEY, String(now));
        } else {
          // Just fetch existing tasks without generating
          aiCalls.push(
            fetch("/api/tasks/list?farm_id=" + farmRow.id).then((r) =>
              r.ok ? r.json() : null
            ),
            Promise.resolve(null) // skip risk scoring
          );
        }

        const [taskResult, riskResult] = await Promise.allSettled(aiCalls);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const taskData = taskResult.status === "fulfilled" ? (taskResult.value as any) : null;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const riskData = riskResult.status === "fulfilled" ? (riskResult.value as any) : null;

        if (taskData) {
          store.setTasks(taskData.tasks || []);
        }

        if (riskData) {
          const riskPlots = riskData.plots as
            | { label: string; warning_level: string; warning_reason: string }[]
            | undefined;
          if (riskPlots) {
            const warnings: Record<
              string,
              { warningLevel: string; warningReason: string }
            > = {};
            for (const rp of riskPlots) {
              warnings[rp.label] = {
                warningLevel: rp.warning_level,
                warningReason: rp.warning_reason,
              };
            }
            store.setPlotWarnings(warnings);

            store.setPlots(
              plotRows.map((p) => {
                const rp = riskPlots.find((r) => r.label === p.label);
                if (rp) return { ...p, warning_level: rp.warning_level };
                return p;
              })
            );

            // Notification for high-risk plots
            const highRisk = riskPlots.filter(
              (rp) =>
                rp.warning_level === "orange" || rp.warning_level === "red"
            );
            if (highRisk.length > 0) {
              store.addNotification({
                type: "risk",
                title: "Plot Alert",
                message: `${highRisk.length} plot(s) need attention: ${highRisk.map((r) => r.label).join(", ")}`,
              });

              // Refresh tasks
              try {
                const refreshRes = await fetch(
                  "/api/tasks/list?farm_id=" + farmRow.id
                );
                if (refreshRes.ok) {
                  const refreshData = await refreshRes.json();
                  store.setTasks(refreshData.tasks || []);
                }
              } catch {
                // Non-critical
              }
            }
          }
        }

        // Harvest ready notification
        const harvestReady = plotRows.filter(
          (p) => p.growth_stage === "harvest_ready"
        );
        if (harvestReady.length > 0) {
          store.addNotification({
            type: "harvest",
            title: "Harvest Ready!",
            message: `${harvestReady.length} plot(s) ready: ${harvestReady.map((p) => `${p.label} (${p.crop_name})`).join(", ")}`,
          });
        }
      } catch (err) {
        console.error("Failed to load farm:", err);
        setLoading(false);
        setLoadError(true);
      }
    }

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTileClick = useCallback(
    (plotLabel: string) => {
      const plot = plots.find((p) => p.label === plotLabel);
      if (plot) store.setSelectedPlot(plot);
    },
    [plots, store]
  );

  const handleCompleteTask = useCallback(
    async (taskId: string) => {
      try {
        const res = await fetch("/api/tasks/complete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task_id: taskId }),
        });
        if (res.ok) {
          store.removeTask(taskId);
          toast.success("Task completed!");
        }
      } catch {
        toast.error("Failed to complete task");
      }
    },
    [store]
  );

  const handleScanCrop = useCallback(() => {
    const urgent = plots.find(
      (p) => p.warning_level === "red" || p.warning_level === "orange"
    );
    const target = urgent || plots[0];
    if (target) {
      router.push(`/inspection?plot_id=${target.id}`);
    }
  }, [plots, router]);

  const handleHarvest = useCallback(
    async (plotId: string) => {
      try {
        const res = await fetch("/api/plots/harvest", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plot_id: plotId }),
        });
        if (res.ok) {
          store.updatePlot(plotId, {
            growth_stage: "harvested",
            warning_level: "none",
          });
          toast.success("Plot harvested! 🌾");
        }
      } catch {
        toast.error("Failed to harvest plot");
      }
    },
    [store]
  );

  const handleCloseSheet = useCallback(() => {
    store.setSelectedPlot(null);
  }, [store]);

  // ── Loading ──
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="h-[40vh] animate-pulse bg-gray-200" />
        <div className="px-4 pt-5 space-y-4">
          <div className="flex gap-2">
            {[1, 2, 3, 4].map((i) => (
              <SkeletonCard key={i} className="flex-1 min-w-[80px]" />
            ))}
          </div>
          <SkeletonLine className="h-4 w-32" />
          <div className="flex gap-3">
            {[1, 2, 3].map((i) => (
              <SkeletonCard key={i} className="w-[100px] h-[120px]" />
            ))}
          </div>
          <SkeletonLine className="h-4 w-24" />
          <SkeletonCard className="h-20" />
          <SkeletonCard className="h-20" />
        </div>
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="flex h-screen items-center justify-center bg-green-50 px-6">
        <div className="text-center">
          <span className="mb-4 block text-4xl">😟</span>
          <p className="text-lg text-gray-600">Unable to load your farm.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 rounded-xl bg-green-600 px-6 py-3 font-semibold text-white"
          >
            Tap to retry
          </button>
        </div>
      </div>
    );
  }

  if (!farm) {
    return (
      <div className="flex h-screen items-center justify-center bg-green-50">
        <div className="text-center">
          <p className="text-lg text-gray-600">No farm found.</p>
          <button
            onClick={() => router.push("/onboarding")}
            className="mt-4 rounded-xl bg-green-600 px-6 py-3 text-white"
          >
            Set up your farm
          </button>
        </div>
      </div>
    );
  }

  const weatherEmoji = weather
    ? CONDITION_EMOJI[weather.condition] || "☀️"
    : "☀️";
  const weatherLabel = weather
    ? CONDITION_LABEL[weather.condition] || "Sunny"
    : "Sunny";
  const weatherTemp = weather ? weather.temp_celsius : 27;

  const crops = marketPrices.filter((p) => p.item_type === "crop");
  const supplies = marketPrices.filter(
    (p) => p.item_type === "fertilizer" || p.item_type === "pesticide"
  );

  const forecastDays =
    weather?.forecast && weather.forecast.length > 0
      ? weather.forecast
      : Array.from({ length: 5 }, (_, i) => {
          const d = new Date();
          d.setDate(d.getDate() + i);
          return {
            date: d.toISOString().split("T")[0],
            condition: "sunny",
            temp_min: 25,
            temp_max: 31,
            rain_chance: 0,
          };
        });

  function trendIcon(trend: string) {
    if (trend === "up")
      return <TrendingUp size={14} className="text-green-600" aria-hidden="true" />;
    if (trend === "down")
      return <TrendingDown size={14} className="text-red-500" aria-hidden="true" />;
    return <Minus size={14} className="text-gray-400" aria-hidden="true" />;
  }

  function getDayName(dateStr: string) {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en", { weekday: "short" });
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Farm Map */}
      <div className="relative" style={{ height: "40vh" }}>
        {farm.bounding_box ? (
          <FarmMapView
            polygonGeoJson={farm.polygon_geojson ?? undefined}
            extraPolygons={extraPolygons.length > 0 ? extraPolygons : undefined}
            zones={zoneOverlays.length > 0 ? zoneOverlays : undefined}
            boundingBox={farm.bounding_box}
            plots={plots.map((p) => ({
              label: p.label,
              crop: p.crop_name,
              colour: p.colour_hex,
              growthStage: p.growth_stage,
              warningLevel: p.warning_level,
            }))}
            onPlotClick={handleTileClick}
            className="h-full w-full"
          />
        ) : (
          <div className="flex h-full items-center justify-center bg-gray-900">
            <p className="text-gray-400">Map data not available</p>
          </div>
        )}

        {/* Top-left: Weather badge */}
        <div className="absolute top-4 left-4 z-[1000] rounded-full bg-white/80 px-3 py-1.5 shadow backdrop-blur-sm">
          <span className="text-sm font-medium text-gray-700">
            {weatherEmoji} {weatherLabel} · {weatherTemp}°C
          </span>
        </div>

        {/* Top-right: Farm name + bell + switcher */}
        <div className="absolute top-4 right-4 z-[1000] flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <NotificationBell />
            <span className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-gray-700 shadow backdrop-blur-sm">
              {farm.name || "My Farm"}
            </span>
          </div>
          <FarmSwitcher />
        </div>

        {/* Bottom-right: Redraw boundary button */}
        <button
          onClick={() => router.push("/farm/redraw")}
          aria-label="Edit farm boundary"
          className="absolute bottom-8 right-4 z-[1000] rounded-full bg-white/80 px-4 py-2.5 text-sm font-medium text-gray-600 shadow backdrop-blur-sm transition-colors hover:bg-white"
        >
          ✏️ Edit boundary
        </button>
      </div>

      {/* Scrollable content */}
      <div className="-mt-5 relative z-10 rounded-t-3xl bg-gray-50 px-4 pt-5 pb-4">
        {/* Summary Cards */}
        <div className="mb-5">
          <SummaryCards />
        </div>

        {/* Plot Cards Row */}
        <PlotCardRow />

        {/* Quick Actions */}
        <div className="mb-5 flex gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleScanCrop}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-green-600 px-4 py-3 text-sm font-semibold text-white shadow-sm"
          >
            <Search size={16} aria-hidden="true" />
            Scan crop
          </motion.button>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => router.push("/activity")}
            className="flex flex-1 items-center justify-center gap-2 rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-gray-700 shadow-sm border border-gray-200"
          >
            <Clock size={16} aria-hidden="true" />
            Farm history
          </motion.button>
        </div>

        {/* Today's Tasks */}
        <Card variant="default" className="mb-5 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h3 className="text-base font-bold text-gray-800">
              Today&apos;s Tasks
            </h3>
            <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">
              {tasks.length}
            </span>
          </div>
          <ul className="space-y-2" role="list">
            {tasks.length === 0 ? (
              <li className="rounded-xl border border-dashed border-gray-200 p-4 text-center text-sm text-gray-400">
                All caught up! No tasks for today. ✨
              </li>
            ) : (
              tasks.slice(0, 5).map((task) => {
                const emoji = TASK_TYPE_ICON[task.task_type] || "📋";
                const pStyle =
                  PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.normal;
                return (
                  <li key={task.id}>
                  <motion.div
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex items-start gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                  >
                    <button
                      onClick={() => handleCompleteTask(task.id)}
                      role="checkbox"
                      aria-checked="false"
                      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 transition-all hover:border-green-500 hover:bg-green-50 active:scale-90"
                      aria-label={`Complete: ${task.title}`}
                    >
                      <CheckCircle2
                        size={14}
                        className="text-transparent"
                        aria-hidden="true"
                      />
                    </button>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm">{emoji}</span>
                        <span className="truncate text-sm font-medium text-gray-800">
                          {task.title}
                        </span>
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">
                        {task.description}
                      </p>
                      <div className="mt-1 flex items-center gap-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${pStyle.bg} ${pStyle.text}`}
                        >
                          {pStyle.label}
                        </span>
                        {task.plot_label && (
                          <span className="text-[11px] text-gray-600">
                            Plot {task.plot_label}
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                  </li>
                );
              })
            )}
          </ul>
        </Card>

        {/* 5-Day Forecast */}
        <Card variant="default" className="mb-5 p-4">
          <h3 className="mb-3 text-base font-bold text-gray-800">
            5-Day Forecast
          </h3>
          <div className="flex gap-2 overflow-x-auto custom-scrollbar pb-1">
            {forecastDays.map((day) => (
              <div
                key={day.date}
                className="flex min-w-[64px] flex-shrink-0 flex-col items-center rounded-xl bg-blue-50/60 px-2.5 py-2"
              >
                <span className="text-[10px] font-medium text-gray-500">
                  {getDayName(day.date)}
                </span>
                <span className="my-1 text-lg">
                  {FORECAST_EMOJI[day.condition] || "☀️"}
                </span>
                <span className="text-xs font-semibold text-gray-700">
                  {day.temp_min}–{day.temp_max}°
                </span>
                {day.rain_chance > 0 && (
                  <span className="text-[11px] text-blue-500 font-medium">
                    💧{day.rain_chance}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </Card>

        {/* Market Prices */}
        {crops.length > 0 && (
          <Card variant="default" className="mb-5 p-4">
            <h3 className="mb-3 text-base font-bold text-gray-800">
              Market Prices
            </h3>
            <div className="space-y-1.5">
              {crops.map((p) => (
                <div
                  key={p.item_name}
                  className="flex items-center justify-between rounded-lg px-1 py-1.5"
                >
                  <span className="text-sm text-gray-700">{p.item_name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">
                      RM{p.price_per_kg.toFixed(2)}/{p.unit}
                    </span>
                    {trendIcon(p.trend)}
                    {p.trend_pct !== 0 && (
                      <span
                        className={`text-[11px] font-medium ${
                          p.trend === "up"
                            ? "text-green-600"
                            : p.trend === "down"
                              ? "text-red-500"
                              : "text-gray-400"
                        }`}
                      >
                        {Math.abs(p.trend_pct)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}

        {/* Supplies */}
        {supplies.length > 0 && (
          <Card variant="default" className="mb-5 p-4">
            <h3 className="mb-3 text-base font-bold text-gray-800">
              Fertilizers &amp; Pesticides
            </h3>
            <div className="space-y-1.5">
              {supplies.map((p) => (
                <div
                  key={p.item_name}
                  className="flex items-center justify-between rounded-lg px-1 py-1.5"
                >
                  <span className="text-sm text-gray-700">{p.item_name}</span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-semibold text-gray-900">
                      RM{p.price_per_kg.toFixed(2)}/{p.unit}
                    </span>
                    {trendIcon(p.trend)}
                    {p.trend_pct !== 0 && (
                      <span
                        className={`text-[11px] font-medium ${
                          p.trend === "up"
                            ? "text-green-600"
                            : p.trend === "down"
                              ? "text-red-500"
                              : "text-gray-400"
                        }`}
                      >
                        {Math.abs(p.trend_pct)}%
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </Card>
        )}
      </div>

      {/* Plot Bottom Sheet */}
      <PlotBottomSheet
        plot={selectedPlot}
        onClose={handleCloseSheet}
        onHarvest={handleHarvest}
        warningReason={
          selectedPlot
            ? plotWarnings[selectedPlot.label]?.warningReason
            : undefined
        }
      />
    </div>
  );
}
