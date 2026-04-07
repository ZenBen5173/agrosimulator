"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { MarketPrice, TaskData } from "@/types/farm";

type DrawerState = "collapsed" | "half" | "full";

interface ForecastDay {
  date: string;
  condition: string;
  temp_min: number;
  temp_max: number;
  rain_chance: number;
}

interface SwipeDrawerProps {
  marketPrices: MarketPrice[];
  forecast?: ForecastDay[];
  tasks?: TaskData[];
  onCompleteTask?: (taskId: string) => void;
  onScanCrop?: () => void;
}

// Heights as vh percentages
const HEIGHTS: Record<DrawerState, number> = {
  collapsed: 6,
  half: 38,
  full: 85,
};

function trendArrow(trend: string) {
  if (trend === "up") return "↑";
  if (trend === "down") return "↓";
  return "→";
}

function trendColor(trend: string) {
  if (trend === "up") return "text-green-600";
  if (trend === "down") return "text-red-500";
  return "text-gray-500";
}

const CONDITION_EMOJI: Record<string, string> = {
  sunny: "☀️",
  overcast: "⛅",
  rainy: "🌧️",
  thunderstorm: "⛈️",
  drought: "🔥",
  flood_risk: "🌊",
};

function getDayName(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  return d.toLocaleDateString("en", { weekday: "short" });
}

const TASK_TYPE_EMOJI: Record<string, string> = {
  inspection: "🔍",
  watering: "💧",
  fertilizing: "🌱",
  treatment: "💊",
  harvesting: "🌾",
  replanting: "🔄",
  farm_wide: "🏡",
};

const PRIORITY_STYLE: Record<string, { bg: string; text: string; label: string }> = {
  urgent: { bg: "bg-red-100", text: "text-red-700", label: "Urgent" },
  normal: { bg: "bg-amber-100", text: "text-amber-700", label: "Normal" },
  low: { bg: "bg-gray-100", text: "text-gray-600", label: "Low" },
};

export default function SwipeDrawer({ marketPrices, forecast, tasks = [], onCompleteTask, onScanCrop }: SwipeDrawerProps) {
  const [state, setState] = useState<DrawerState>("collapsed");
  const [dragY, setDragY] = useState<number | null>(null);
  const [startY, setStartY] = useState(0);
  const [startHeight, setStartHeight] = useState(0);
  const drawerRef = useRef<HTMLDivElement>(null);

  const heightVh = dragY !== null ? dragY : HEIGHTS[state];

  const handleTap = useCallback(() => {
    setState((s) => {
      if (s === "collapsed") return "half";
      if (s === "half") return "full";
      return "full";
    });
  }, []);

  // Touch drag
  const onTouchStart = useCallback(
    (e: React.TouchEvent) => {
      setStartY(e.touches[0].clientY);
      setStartHeight(HEIGHTS[state]);
    },
    [state]
  );

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      const deltaY = startY - e.touches[0].clientY;
      const deltaVh = (deltaY / window.innerHeight) * 100;
      const newHeight = Math.max(
        HEIGHTS.collapsed,
        Math.min(HEIGHTS.full, startHeight + deltaVh)
      );
      setDragY(newHeight);
    },
    [startY, startHeight]
  );

  const onTouchEnd = useCallback(() => {
    if (dragY === null) return;

    // Snap to nearest state
    const mid1 = (HEIGHTS.collapsed + HEIGHTS.half) / 2;
    const mid2 = (HEIGHTS.half + HEIGHTS.full) / 2;

    if (dragY < mid1) setState("collapsed");
    else if (dragY < mid2) setState("half");
    else setState("full");

    setDragY(null);
  }, [dragY]);

  // Mouse drag for desktop
  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setStartY(e.clientY);
      setStartHeight(HEIGHTS[state]);

      const onMouseMove = (ev: MouseEvent) => {
        const deltaY = startY - ev.clientY;
        // Use the captured startY for initial position, but we need fresh values
        const deltaFromStart = (e.clientY - ev.clientY) / window.innerHeight * 100;
        const newHeight = Math.max(
          HEIGHTS.collapsed,
          Math.min(HEIGHTS.full, HEIGHTS[state] + deltaFromStart)
        );
        setDragY(newHeight);
      };

      const onMouseUp = () => {
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
        // Snap
        setDragY((prev) => {
          if (prev === null) return null;
          const mid1 = (HEIGHTS.collapsed + HEIGHTS.half) / 2;
          const mid2 = (HEIGHTS.half + HEIGHTS.full) / 2;
          if (prev < mid1) setState("collapsed");
          else if (prev < mid2) setState("half");
          else setState("full");
          return null;
        });
      };

      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [state, startY]
  );

  // Close on escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setState("collapsed");
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, []);

  const crops = marketPrices.filter((p) => p.item_type === "crop");
  const supplies = marketPrices.filter(
    (p) => p.item_type === "fertilizer" || p.item_type === "pesticide"
  );

  return (
    <div
      ref={drawerRef}
      className="fixed right-0 bottom-0 left-0 z-30 bg-white shadow-[0_-4px_20px_rgba(0,0,0,0.1)]"
      style={{
        height: `${heightVh}vh`,
        borderRadius: "20px 20px 0 0",
        transition: dragY !== null ? "none" : "height 0.3s ease-out",
        willChange: "height",
      }}
    >
      {/* Drag handle */}
      <div
        className="flex cursor-grab items-center justify-center pt-2 pb-1 active:cursor-grabbing"
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onMouseDown={onMouseDown}
        onClick={handleTap}
      >
        <div className="h-1 w-10 rounded-full bg-gray-300" />
      </div>

      {/* Collapsed pill */}
      {state === "collapsed" && dragY === null && (
        <div className="flex justify-center px-4">
          <span className="rounded-full bg-green-100 px-4 py-1 text-xs font-medium text-green-700">
            {tasks.length > 0
              ? `${tasks.length} task${tasks.length > 1 ? "s" : ""} today`
              : "No tasks today"}
          </span>
        </div>
      )}

      {/* Scrollable content */}
      <div
        className="overflow-y-auto px-4 pb-8"
        style={{
          height: `calc(${heightVh}vh - 36px)`,
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        }}
      >
        {/* Today's Tasks section */}
        <div className="mb-4">
          <div className="mb-2 flex items-center gap-2">
            <h3 className="text-sm font-bold text-gray-800">
              Today&apos;s Tasks
            </h3>
            <span className="rounded-full bg-gray-200 px-2 py-0.5 text-xs font-medium text-gray-600">
              {tasks.length}
            </span>
          </div>
          <div className="space-y-2">
            {tasks.length === 0 ? (
              <div className="rounded-lg border border-dashed border-gray-200 p-3 text-center text-sm text-gray-400">
                All caught up! No tasks for today.
              </div>
            ) : (
              tasks.map((task) => {
                const emoji = TASK_TYPE_EMOJI[task.task_type] || "📋";
                const pStyle = PRIORITY_STYLE[task.priority] || PRIORITY_STYLE.normal;
                return (
                  <div
                    key={task.id}
                    className="flex items-start gap-3 rounded-lg bg-gray-50 px-3 py-2.5"
                  >
                    <button
                      onClick={() => onCompleteTask?.(task.id)}
                      className="mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 border-gray-300 transition-colors hover:border-green-500 hover:bg-green-50"
                      aria-label={`Complete task: ${task.title}`}
                    >
                      <span className="text-[10px] text-transparent group-hover:text-green-500">
                        ✓
                      </span>
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
                          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${pStyle.bg} ${pStyle.text}`}
                        >
                          {pStyle.label}
                        </span>
                        {task.plot_label && (
                          <span className="text-[10px] text-gray-400">
                            Plot {task.plot_label}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Weather strip */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-bold text-gray-800">
            5-Day Forecast
          </h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {(forecast && forecast.length > 0
              ? forecast
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
                })
            ).map((day) => (
              <div
                key={day.date}
                className="flex flex-shrink-0 flex-col items-center rounded-lg bg-sky-50 px-3 py-2"
              >
                <span className="text-xs text-gray-500">
                  {getDayName(day.date)}
                </span>
                <span className="text-lg">
                  {CONDITION_EMOJI[day.condition] || "☀️"}
                </span>
                <span className="text-xs font-medium text-gray-700">
                  {day.temp_min}–{day.temp_max}°C
                </span>
                {day.rain_chance > 0 && (
                  <span className="text-[10px] text-blue-500">
                    💧{day.rain_chance}%
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Market prices chips */}
        <div className="mb-4">
          <h3 className="mb-2 text-sm font-bold text-gray-800">
            Market Prices
          </h3>
          <div className="flex flex-wrap gap-2">
            {crops.map((p) => (
              <span
                key={p.item_name}
                className="rounded-full border border-gray-200 bg-gray-50 px-3 py-1 text-xs font-medium text-gray-700"
              >
                {p.item_name.split("(")[0].trim()} RM
                {p.price_per_kg.toFixed(2)}/{p.unit}{" "}
                <span className={trendColor(p.trend)}>
                  {trendArrow(p.trend)}
                </span>
              </span>
            ))}
          </div>
        </div>

        {/* Full state — expanded content */}
        {(state === "full" || (dragY !== null && dragY > 60)) && (
          <>
            {/* Full market prices list */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-bold text-gray-800">
                All Crops
              </h3>
              <div className="space-y-1">
                {crops.map((p) => (
                  <div
                    key={p.item_name}
                    className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                  >
                    <span className="text-sm text-gray-700">
                      {p.item_name}
                    </span>
                    <span className="text-sm font-medium text-gray-900">
                      RM{p.price_per_kg.toFixed(2)}/{p.unit}{" "}
                      <span className={trendColor(p.trend)}>
                        {trendArrow(p.trend)}{" "}
                        {p.trend_pct !== 0
                          ? `${Math.abs(p.trend_pct)}%`
                          : ""}
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {supplies.length > 0 && (
              <div className="mb-4">
                <h3 className="mb-2 text-sm font-bold text-gray-800">
                  Fertilizers &amp; Pesticides
                </h3>
                <div className="space-y-1">
                  {supplies.map((p) => (
                    <div
                      key={p.item_name}
                      className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2"
                    >
                      <span className="text-sm text-gray-700">
                        {p.item_name}
                      </span>
                      <span className="text-sm font-medium text-gray-900">
                        RM{p.price_per_kg.toFixed(2)}/{p.unit}{" "}
                        <span className={trendColor(p.trend)}>
                          {trendArrow(p.trend)}{" "}
                          {p.trend_pct !== 0
                            ? `${Math.abs(p.trend_pct)}%`
                            : ""}
                        </span>
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Quick actions */}
            <div className="mb-4">
              <h3 className="mb-2 text-sm font-bold text-gray-800">
                Quick Actions
              </h3>
              <div className="flex gap-3">
                <button
                  onClick={onScanCrop}
                  className="flex-1 rounded-xl bg-green-50 px-4 py-3 text-center text-sm font-medium text-green-700 transition-colors hover:bg-green-100"
                >
                  🔍 Scan a crop
                </button>
                <button className="flex-1 rounded-xl bg-blue-50 px-4 py-3 text-center text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100">
                  📋 Farm history
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
