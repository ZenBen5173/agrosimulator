"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import SwipeDrawer from "@/components/SwipeDrawer";
import PlotBottomSheet from "@/components/PlotBottomSheet";
import type { GridJson, PlotData, MarketPrice, TaskData } from "@/types/farm";

const FarmCanvas = dynamic(() => import("@/components/FarmCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-sky-200">
      <p className="text-green-700">Loading farm...</p>
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
}

interface GridCellRow {
  row: number;
  col: number;
  is_active: boolean;
  plot_id: string | null;
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

export default function HomePage() {
  const router = useRouter();
  const supabase = createClient();

  const [farm, setFarm] = useState<FarmRow | null>(null);
  const [gridJson, setGridJson] = useState<GridJson | null>(null);
  const [plots, setPlots] = useState<PlotData[]>([]);
  const [marketPrices, setMarketPrices] = useState<MarketPrice[]>([]);
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [tasks, setTasks] = useState<TaskData[]>([]);
  const [plotWarnings, setPlotWarnings] = useState<
    Record<string, { warningLevel: string; warningReason: string }>
  >({});
  const [selectedPlot, setSelectedPlot] = useState<PlotData | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

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

      // Fetch farm
      const { data: farmRow } = await supabase
        .from("farms")
        .select("id, name, area_acres, grid_size, soil_type, water_source")
        .eq("onboarding_done", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!farmRow) {
        router.replace("/onboarding");
        return;
      }

      setFarm(farmRow);

      // Fetch plots, grid_cells, market_prices in parallel
      const [plotsRes, cellsRes, pricesRes] = await Promise.all([
        supabase
          .from("plots")
          .select(
            "id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest"
          )
          .eq("farm_id", farmRow.id),
        supabase
          .from("grid_cells")
          .select("row, col, is_active, plot_id")
          .eq("farm_id", farmRow.id),
        supabase
          .from("market_prices")
          .select(
            "item_name, item_type, price_per_kg, unit, trend, trend_pct"
          )
          .order("item_type")
          .order("item_name"),
      ]);

      const plotRows: PlotData[] = plotsRes.data || [];
      const cellRows: GridCellRow[] = cellsRes.data || [];

      setPlots(plotRows);
      setMarketPrices(pricesRes.data || []);

      // Reconstruct GridJson from DB
      if (plotRows.length > 0 && cellRows.length > 0) {
        const gridSize = farmRow.grid_size || 6;

        const idToLabel: Record<string, string> = {};
        const plotInfoMap: GridJson["plots"] = {};

        for (const p of plotRows) {
          idToLabel[p.id] = p.label;
          plotInfoMap[p.label] = {
            crop: p.crop_name,
            colour: p.colour_hex,
            reason: "",
          };
        }

        const grid: string[][] = Array.from({ length: gridSize }, () =>
          Array(gridSize).fill("out")
        );

        for (const cell of cellRows) {
          if (cell.row < gridSize && cell.col < gridSize) {
            if (cell.is_active && cell.plot_id && idToLabel[cell.plot_id]) {
              grid[cell.row][cell.col] = idToLabel[cell.plot_id];
            } else if (!cell.is_active) {
              grid[cell.row][cell.col] = "out";
            }
          }
        }

        setGridJson({ grid, plots: plotInfoMap });
      }

      setLoading(false);

      // Fetch weather (non-blocking)
      try {
        const weatherRes = await fetch(
          `/api/weather?farm_id=${farmRow.id}`
        );
        if (weatherRes.ok) {
          const weatherData: WeatherData = await weatherRes.json();
          setWeather(weatherData);
        }
      } catch {
        console.warn("Failed to fetch weather, using defaults");
      }

      // Generate tasks + recalculate risk in parallel (non-blocking)
      const [taskResult, riskResult] = await Promise.allSettled([
        fetch("/api/tasks/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ farm_id: farmRow.id }),
        }).then((r) => (r.ok ? r.json() : null)),
        fetch("/api/plots/recalculate-risk", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ farm_id: farmRow.id }),
        }).then((r) => (r.ok ? r.json() : null)),
      ]);

      if (taskResult.status === "fulfilled" && taskResult.value) {
        setTasks(taskResult.value.tasks || []);
      }

      if (riskResult.status === "fulfilled" && riskResult.value) {
        const riskPlots = riskResult.value.plots as
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
          setPlotWarnings(warnings);

          // Update plots state with new warning levels
          setPlots((prev) =>
            prev.map((p) => {
              const rp = riskPlots.find((r) => r.label === p.label);
              if (rp) {
                return { ...p, warning_level: rp.warning_level };
              }
              return p;
            })
          );

          // Auto-inject inspection tasks for orange/red plots
          const hasHighRisk = riskPlots.some(
            (rp) =>
              rp.warning_level === "orange" || rp.warning_level === "red"
          );
          if (hasHighRisk && taskResult.status === "fulfilled") {
            // Refresh tasks to include new inspection tasks
            try {
              // Delete today's auto-generated tasks so they regenerate with inspection tasks
              const refreshRes = await fetch("/api/tasks/list?farm_id=" + farmRow.id);
              if (refreshRes.ok) {
                const refreshData = await refreshRes.json();
                setTasks(refreshData.tasks || []);
              }
            } catch {
              // Non-critical
            }
          }
        }
      }
    } catch (err) {
        console.error("Failed to load farm:", err);
        setLoading(false);
        setLoadError(true);
      }
    }

    load();
  }, [supabase, router]);

  // Build plotStages map from plots data
  const plotStages = useMemo(() => {
    const map: Record<string, { cropName: string; growthStage: string }> = {};
    for (const p of plots) {
      map[p.label] = { cropName: p.crop_name, growthStage: p.growth_stage };
    }
    return map;
  }, [plots]);

  const handleTileClick = useCallback(
    (plotLabel: string) => {
      const plot = plots.find((p) => p.label === plotLabel);
      if (plot) setSelectedPlot(plot);
    },
    [plots]
  );

  const handleCompleteTask = useCallback(async (taskId: string) => {
    try {
      const res = await fetch("/api/tasks/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ task_id: taskId }),
      });
      if (res.ok) {
        setTasks((prev) => prev.filter((t) => t.id !== taskId));
      }
    } catch {
      console.warn("Failed to complete task");
    }
  }, []);

  const handleScanCrop = useCallback(() => {
    // Pick the most urgent plot (orange/red first), otherwise first active plot
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
          // Update local plot state
          setPlots((prev) =>
            prev.map((p) =>
              p.id === plotId
                ? { ...p, growth_stage: "harvested", warning_level: "none" }
                : p
            )
          );
          // Update selectedPlot so the sheet rerenders with "Plan next crop" CTA
          setSelectedPlot((prev) =>
            prev && prev.id === plotId
              ? { ...prev, growth_stage: "harvested", warning_level: "none" }
              : prev
          );
        }
      } catch {
        console.warn("Failed to harvest plot");
      }
    },
    []
  );

  const handleCloseSheet = useCallback(() => {
    setSelectedPlot(null);
  }, []);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-sky-100">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute h-full w-full animate-pulse rounded-full bg-green-100" />
            <span className="relative text-4xl">🌾</span>
          </div>
          <p className="text-green-700">Loading your farm...</p>
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

  if (!farm || !gridJson) {
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

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-sky-200">
      {/* Farm Canvas — fills full screen behind the drawer */}
      <div className="absolute inset-0" style={{ height: "70vh" }}>
        <FarmCanvas
          gridJson={gridJson}
          onTileClick={handleTileClick}
          weatherCondition={weather?.condition}
          plotStages={plotStages}
          plotWarnings={plotWarnings}
          className="h-full w-full"
        />
      </div>

      {/* Top-left: Weather badge */}
      <div className="absolute top-4 left-4 z-20 rounded-full bg-white/80 px-3 py-1.5 shadow backdrop-blur-sm">
        <span className="text-sm font-medium text-gray-700">
          {weatherEmoji} {weatherLabel} · {weatherTemp}°C
        </span>
      </div>

      {/* Top-right: Farm name + settings */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-2">
        <span className="rounded-full bg-white/80 px-3 py-1.5 text-sm font-medium text-gray-700 shadow backdrop-blur-sm">
          {farm.name || "My Farm"}
        </span>
        <button className="rounded-full bg-white/80 p-2 shadow backdrop-blur-sm">
          <svg
            className="h-4 w-4 text-gray-600"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.066 2.573c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.573 1.066c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.066-2.573c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
            />
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
            />
          </svg>
        </button>
      </div>

      {/* Swipe Drawer */}
      <SwipeDrawer
        marketPrices={marketPrices}
        forecast={weather?.forecast}
        tasks={tasks}
        onCompleteTask={handleCompleteTask}
        onScanCrop={handleScanCrop}
      />

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
