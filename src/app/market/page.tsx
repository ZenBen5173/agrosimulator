"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  ChevronDown,
  RefreshCw,
  ArrowLeft,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PricePoint {
  date: string;
  price: number;
  high: number;
  low: number;
}

interface ItemHistory {
  item_name: string;
  item_type: string;
  unit: string;
  current_price: number;
  trend: string;
  trend_pct: number;
  data: PricePoint[];
}

type Tab = "crop" | "supply";
type TimeRange = 7 | 30 | 90;

/* ------------------------------------------------------------------ */
/*  Crop emoji helper                                                  */
/* ------------------------------------------------------------------ */

const ITEM_EMOJI: Record<string, string> = {
  "Paddy/Rice": "🌾",
  "Oil Palm (FFB)": "🌴",
  Rubber: "🌳",
  Chilli: "🌶️",
  Tomato: "🍅",
  Cucumber: "🥒",
  Kangkung: "🥬",
  Durian: "🥭",
  Banana: "🍌",
  "NPK Fertilizer": "🧪",
  Urea: "🧪",
  Glyphosate: "🧴",
  Cypermethrin: "🧴",
};

/* ------------------------------------------------------------------ */
/*  Sparkline (pure SVG — lightweight, no recharts dependency)         */
/* ------------------------------------------------------------------ */

function Sparkline({
  data,
  trend,
  width = 80,
  height = 32,
}: {
  data: PricePoint[];
  trend: string;
  width?: number;
  height?: number;
}) {
  if (!data || data.length < 2) return null;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const range = max - min || 1;

  const points = prices
    .map((p, i) => {
      const x = (i / (prices.length - 1)) * width;
      const y = height - ((p - min) / range) * (height - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");

  const color =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#9ca3af";

  // Create fill path (area under curve)
  const fillPoints = `0,${height} ${points} ${width},${height}`;

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-hidden="true"
      className="flex-shrink-0"
    >
      <defs>
        <linearGradient
          id={`spark-fill-${trend}`}
          x1="0"
          y1="0"
          x2="0"
          y2="1"
        >
          <stop offset="0%" stopColor={color} stopOpacity="0.2" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <polygon
        points={fillPoints}
        fill={`url(#spark-fill-${trend})`}
      />
      <polyline
        points={points}
        fill="none"
        stroke={color}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Area Chart (pure SVG — stock-market style)                         */
/* ------------------------------------------------------------------ */

function AreaChart({
  data,
  trend,
  unit,
}: {
  data: PricePoint[];
  trend: string;
  unit: string;
}) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (!data || data.length < 2)
    return (
      <div className="flex h-48 items-center justify-center text-sm text-gray-400">
        No data available
      </div>
    );

  const W = 600;
  const H = 200;
  const PAD_T = 20;
  const PAD_B = 28;
  const PAD_L = 48;
  const PAD_R = 12;

  const prices = data.map((d) => d.price);
  const min = Math.min(...prices, ...data.map((d) => d.low));
  const max = Math.max(...prices, ...data.map((d) => d.high));
  const range = max - min || 1;

  const chartW = W - PAD_L - PAD_R;
  const chartH = H - PAD_T - PAD_B;

  function x(i: number) {
    return PAD_L + (i / (data.length - 1)) * chartW;
  }
  function y(v: number) {
    return PAD_T + chartH - ((v - min) / range) * chartH;
  }

  const linePath = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.price)}`)
    .join(" ");

  const areaPath = `${linePath} L${x(data.length - 1)},${H - PAD_B} L${PAD_L},${H - PAD_B} Z`;

  // High-low range band
  const bandUpper = data
    .map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.high)}`)
    .join(" ");
  const bandLower = data
    .map((d, i) => `L${x(data.length - 1 - i)},${y(data[data.length - 1 - i].low)}`)
    .join(" ");
  const bandPath = `${bandUpper} ${bandLower} Z`;

  const mainColor =
    trend === "up" ? "#22c55e" : trend === "down" ? "#ef4444" : "#6b7280";
  const gradId = `area-grad-${trend}`;

  // Y-axis labels (5 ticks)
  const yTicks = Array.from({ length: 5 }, (_, i) => {
    const v = min + (range * i) / 4;
    return { v, y: y(v) };
  });

  // X-axis labels (show ~6 dates)
  const step = Math.max(1, Math.floor(data.length / 6));
  const xLabels = data.filter((_, i) => i % step === 0 || i === data.length - 1);

  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="relative">
      {/* Tooltip */}
      <AnimatePresence>
        {hovered && hoveredIndex !== null && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="absolute top-0 z-10 rounded-lg bg-gray-900 px-3 py-1.5 text-xs text-white shadow-lg pointer-events-none"
            style={{
              left: `${Math.min(85, Math.max(5, ((hoveredIndex) / (data.length - 1)) * 100))}%`,
              transform: "translateX(-50%)",
            }}
          >
            <div className="font-semibold">
              RM{hovered.price.toFixed(2)}/{unit}
            </div>
            <div className="text-gray-300">
              H: RM{hovered.high.toFixed(2)} · L: RM{hovered.low.toFixed(2)}
            </div>
            <div className="text-gray-400">{hovered.date}</div>
          </motion.div>
        )}
      </AnimatePresence>

      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="w-full h-auto"
        preserveAspectRatio="xMidYMid meet"
        onMouseLeave={() => setHoveredIndex(null)}
        role="img"
        aria-label="Price history chart"
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={mainColor} stopOpacity="0.25" />
            <stop offset="100%" stopColor={mainColor} stopOpacity="0.02" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {yTicks.map((t, i) => (
          <g key={i}>
            <line
              x1={PAD_L}
              y1={t.y}
              x2={W - PAD_R}
              y2={t.y}
              stroke="#e5e7eb"
              strokeWidth="0.5"
              strokeDasharray="4,4"
            />
            <text
              x={PAD_L - 6}
              y={t.y + 3}
              textAnchor="end"
              className="fill-gray-400"
              fontSize="10"
            >
              {t.v.toFixed(2)}
            </text>
          </g>
        ))}

        {/* X-axis labels */}
        {xLabels.map((d, i) => {
          const idx = data.indexOf(d);
          return (
            <text
              key={i}
              x={x(idx)}
              y={H - 6}
              textAnchor="middle"
              className="fill-gray-400"
              fontSize="9"
            >
              {new Date(d.date).toLocaleDateString("en-MY", {
                day: "numeric",
                month: "short",
              })}
            </text>
          );
        })}

        {/* High-low band */}
        <path d={bandPath} fill={mainColor} opacity="0.06" />

        {/* Area fill */}
        <path d={areaPath} fill={`url(#${gradId})`} />

        {/* Price line */}
        <path
          d={linePath}
          fill="none"
          stroke={mainColor}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Hover targets — invisible wider rects for touch/mouse */}
        {data.map((_, i) => (
          <rect
            key={i}
            x={x(i) - chartW / data.length / 2}
            y={PAD_T}
            width={chartW / data.length}
            height={chartH}
            fill="transparent"
            onMouseEnter={() => setHoveredIndex(i)}
            onTouchStart={() => setHoveredIndex(i)}
          />
        ))}

        {/* Hover crosshair */}
        {hoveredIndex !== null && (
          <>
            <line
              x1={x(hoveredIndex)}
              y1={PAD_T}
              x2={x(hoveredIndex)}
              y2={H - PAD_B}
              stroke={mainColor}
              strokeWidth="1"
              strokeDasharray="3,3"
              opacity="0.5"
            />
            <circle
              cx={x(hoveredIndex)}
              cy={y(data[hoveredIndex].price)}
              r="4"
              fill="white"
              stroke={mainColor}
              strokeWidth="2"
            />
          </>
        )}
      </svg>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Stats summary bar                                                  */
/* ------------------------------------------------------------------ */

function StatsSummary({
  data,
  unit,
}: {
  data: PricePoint[];
  unit: string;
}) {
  if (!data || data.length === 0) return null;

  const prices = data.map((d) => d.price);
  const high = Math.max(...data.map((d) => d.high));
  const low = Math.min(...data.map((d) => d.low));
  const avg = prices.reduce((a, b) => a + b, 0) / prices.length;
  const first = prices[0];
  const last = prices[prices.length - 1];
  const changePct = ((last - first) / first) * 100;

  return (
    <div className="grid grid-cols-4 gap-2">
      <div className="rounded-xl bg-green-50 p-2.5 text-center">
        <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">
          High
        </p>
        <p className="text-sm font-bold text-green-700">
          {high.toFixed(2)}
        </p>
      </div>
      <div className="rounded-xl bg-red-50 p-2.5 text-center">
        <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">
          Low
        </p>
        <p className="text-sm font-bold text-red-600">
          {low.toFixed(2)}
        </p>
      </div>
      <div className="rounded-xl bg-blue-50 p-2.5 text-center">
        <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">
          Average
        </p>
        <p className="text-sm font-bold text-blue-700">
          {avg.toFixed(2)}
        </p>
      </div>
      <div className="rounded-xl bg-gray-50 p-2.5 text-center">
        <p className="text-[9px] font-medium text-gray-500 uppercase tracking-wide">
          Change
        </p>
        <p
          className={`text-sm font-bold ${
            changePct > 0
              ? "text-green-600"
              : changePct < 0
                ? "text-red-600"
                : "text-gray-600"
          }`}
        >
          {changePct > 0 ? "+" : ""}
          {changePct.toFixed(1)}%
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Item row card (list view)                                          */
/* ------------------------------------------------------------------ */

function PriceRow({
  item,
  isSelected,
  onClick,
}: {
  item: ItemHistory;
  isSelected: boolean;
  onClick: () => void;
}) {
  const emoji = ITEM_EMOJI[item.item_name] || "📦";
  const trendColor =
    item.trend === "up"
      ? "text-green-600"
      : item.trend === "down"
        ? "text-red-500"
        : "text-gray-400";

  const borderColor =
    item.trend === "up"
      ? "border-l-green-400"
      : item.trend === "down"
        ? "border-l-red-400"
        : "border-l-gray-200";

  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      className={`w-full flex items-center gap-3 rounded-xl border-l-[3px] px-3 py-3 text-left transition-all ${borderColor} ${
        isSelected
          ? "bg-green-50 border border-green-200 shadow-sm"
          : "bg-white border border-transparent hover:bg-gray-50"
      }`}
    >
      {/* Emoji */}
      <span className="text-xl flex-shrink-0">{emoji}</span>

      {/* Name + trend */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-gray-900 truncate">
          {item.item_name}
        </p>
        <div className="flex items-center gap-1 mt-0.5">
          {item.trend === "up" ? (
            <TrendingUp size={12} className="text-green-500" aria-hidden="true" />
          ) : item.trend === "down" ? (
            <TrendingDown size={12} className="text-red-500" aria-hidden="true" />
          ) : (
            <Minus size={12} className="text-gray-400" aria-hidden="true" />
          )}
          <span className={`text-[11px] font-medium ${trendColor}`}>
            {item.trend_pct > 0 ? `${item.trend_pct}%` : "Stable"}
          </span>
        </div>
      </div>

      {/* Sparkline */}
      <Sparkline data={item.data} trend={item.trend} width={72} height={28} />

      {/* Price */}
      <div className="text-right flex-shrink-0">
        <p className="text-sm font-bold text-gray-900">
          RM{item.current_price.toFixed(2)}
        </p>
        <p className="text-[10px] text-gray-400">/{item.unit}</p>
      </div>

      <ChevronDown
        size={14}
        className={`text-gray-300 flex-shrink-0 transition-transform ${
          isSelected ? "rotate-180" : ""
        }`}
        aria-hidden="true"
      />
    </motion.button>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function MarketPricesPage() {
  const router = useRouter();
  const [tab, setTab] = useState<Tab>("crop");
  const [range, setRange] = useState<TimeRange>(30);
  const [history, setHistory] = useState<Record<string, ItemHistory>>({});
  const [loading, setLoading] = useState(true);
  const [selectedItem, setSelectedItem] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const fetchHistory = useCallback(async (days: number) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/market-prices/history?days=${days}`);
      const json = await res.json();
      if (json.history) {
        setHistory(json.history);
      }
    } catch (err) {
      console.error("Failed to fetch market history:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchHistory(range);
  }, [range, fetchHistory]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/market-prices/refresh", { method: "POST" });
      await fetchHistory(range);
    } catch (err) {
      console.error("Failed to refresh:", err);
    } finally {
      setRefreshing(false);
    }
  };

  // Filter items by tab
  const items = useMemo(() => {
    return Object.values(history).filter((h) =>
      tab === "crop"
        ? h.item_type === "crop"
        : h.item_type === "fertilizer" || h.item_type === "pesticide"
    );
  }, [history, tab]);

  const selectedHistory = selectedItem ? history[selectedItem] : null;

  // Market overview stats
  const upCount = items.filter((i) => i.trend === "up").length;
  const downCount = items.filter((i) => i.trend === "down").length;

  const TIME_RANGES: { label: string; value: TimeRange }[] = [
    { label: "7D", value: 7 },
    { label: "30D", value: 30 },
    { label: "90D", value: 90 },
  ];

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-white/90 backdrop-blur-md border-b border-gray-100">
        <div className="flex items-center gap-3 px-4 py-3">
          <button
            onClick={() => router.back()}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} className="text-gray-700" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-gray-900">Market Prices</h1>
            <p className="text-[11px] text-gray-400">
              Updated {new Date().toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
          <motion.button
            onClick={handleRefresh}
            whileTap={{ scale: 0.9 }}
            disabled={refreshing}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors disabled:opacity-50"
            aria-label="Refresh prices"
          >
            <RefreshCw
              size={18}
              className={`text-gray-500 ${refreshing ? "animate-spin" : ""}`}
            />
          </motion.button>
        </div>

        {/* Market mood bar */}
        <div className="flex items-center gap-3 px-4 pb-2">
          <div className="flex items-center gap-1">
            <TrendingUp size={13} className="text-green-500" aria-hidden="true" />
            <span className="text-xs font-medium text-green-600">
              {upCount} up
            </span>
          </div>
          <div className="flex items-center gap-1">
            <TrendingDown size={13} className="text-red-500" aria-hidden="true" />
            <span className="text-xs font-medium text-red-500">
              {downCount} down
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Minus size={13} className="text-gray-400" aria-hidden="true" />
            <span className="text-xs font-medium text-gray-400">
              {items.length - upCount - downCount} stable
            </span>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex px-4 gap-1">
          {(
            [
              { key: "crop" as Tab, label: "Crops" },
              { key: "supply" as Tab, label: "Fertilizers & Pesticides" },
            ] as const
          ).map((t) => (
            <button
              key={t.key}
              onClick={() => {
                setTab(t.key);
                setSelectedItem(null);
              }}
              className={`relative flex-1 py-2.5 text-sm font-medium text-center rounded-t-lg transition-colors ${
                tab === t.key
                  ? "text-green-700 bg-green-50"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {t.label}
              {tab === t.key && (
                <motion.div
                  layoutId="market-tab"
                  className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-green-600"
                  transition={{ type: "spring", stiffness: 400, damping: 30 }}
                />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Time range selector */}
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-xs text-gray-500 font-medium">
          Price history ({range} days)
        </p>
        <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5">
          {TIME_RANGES.map((tr) => (
            <button
              key={tr.value}
              onClick={() => setRange(tr.value)}
              className={`px-3 py-1 text-xs font-semibold rounded-md transition-all ${
                range === tr.value
                  ? "bg-white text-green-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              }`}
            >
              {tr.label}
            </button>
          ))}
        </div>
      </div>

      {/* Loading skeleton */}
      {loading && (
        <div className="px-4 space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-16 rounded-xl bg-gray-100 animate-pulse"
              aria-hidden="true"
            />
          ))}
        </div>
      )}

      {/* Item list */}
      {!loading && (
        <div className="px-4 space-y-1.5">
          {items.map((item) => (
            <div key={item.item_name}>
              <PriceRow
                item={item}
                isSelected={selectedItem === item.item_name}
                onClick={() =>
                  setSelectedItem(
                    selectedItem === item.item_name ? null : item.item_name
                  )
                }
              />

              {/* Expanded detail chart */}
              <AnimatePresence>
                {selectedItem === item.item_name && selectedHistory && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-gray-100 bg-white p-3 mt-1 mb-1 shadow-sm">
                      {/* Chart */}
                      <AreaChart
                        data={selectedHistory.data}
                        trend={selectedHistory.trend}
                        unit={selectedHistory.unit}
                      />

                      {/* Stats row */}
                      <div className="mt-3">
                        <StatsSummary
                          data={selectedHistory.data}
                          unit={selectedHistory.unit}
                        />
                      </div>

                      {/* Current price callout */}
                      <div className="mt-3 flex items-center justify-between rounded-xl bg-gray-50 px-4 py-2.5">
                        <div>
                          <p className="text-[10px] text-gray-500 font-medium uppercase tracking-wide">
                            Current Price
                          </p>
                          <p className="text-lg font-bold text-gray-900">
                            RM{selectedHistory.current_price.toFixed(2)}
                            <span className="text-sm font-normal text-gray-400">
                              /{selectedHistory.unit}
                            </span>
                          </p>
                        </div>
                        <div
                          className={`flex items-center gap-1 rounded-full px-3 py-1 ${
                            selectedHistory.trend === "up"
                              ? "bg-green-100 text-green-700"
                              : selectedHistory.trend === "down"
                                ? "bg-red-100 text-red-700"
                                : "bg-gray-100 text-gray-600"
                          }`}
                        >
                          {selectedHistory.trend === "up" ? (
                            <TrendingUp size={14} aria-hidden="true" />
                          ) : selectedHistory.trend === "down" ? (
                            <TrendingDown size={14} aria-hidden="true" />
                          ) : (
                            <Minus size={14} aria-hidden="true" />
                          )}
                          <span className="text-sm font-semibold">
                            {selectedHistory.trend_pct > 0
                              ? `${selectedHistory.trend_pct}%`
                              : "Stable"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          ))}

          {items.length === 0 && (
            <div className="text-center py-12 text-gray-400">
              <p className="text-sm">No price data available</p>
              <button
                onClick={handleRefresh}
                className="mt-2 text-sm font-medium text-green-600 hover:underline"
              >
                Refresh prices
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
