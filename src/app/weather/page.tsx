"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Droplets,
  Wind,
  Thermometer,
  Sun,
  CloudRain,
  Eye,
  Sprout,
  RefreshCw,
} from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";
import { createClient } from "@/lib/supabase/client";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HourlyPoint {
  time: string;
  temp: number;
  humidity: number;
  wind_kmh: number;
  rain_mm: number;
  condition: string;
}

interface DailyDetail {
  date: string;
  condition: string;
  temp_min: number;
  temp_max: number;
  rain_chance: number;
  rain_mm: number;
  humidity_avg: number;
  wind_avg: number;
  uv_index: number;
}

interface SprayCondition {
  condition: "good" | "fair" | "poor";
  reason: string;
  wind: number;
  humidity: number;
}

interface WeatherDetail {
  current: {
    condition: string;
    temp_celsius: number;
    humidity_pct: number;
    rainfall_mm: number;
    wind_kmh: number;
    fetched_at: string;
  };
  location: string;
  hourly: HourlyPoint[];
  weekly: DailyDetail[];
  spray: SprayCondition;
  monsoon: string;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

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
  thunderstorm: "Thunderstorm",
  drought: "Drought",
  flood_risk: "Flood Risk",
};

const CONDITION_BG: Record<string, string> = {
  sunny: "from-amber-400 via-orange-300 to-yellow-200",
  overcast: "from-gray-400 via-slate-300 to-gray-200",
  rainy: "from-blue-500 via-blue-400 to-sky-300",
  thunderstorm: "from-gray-700 via-slate-600 to-gray-500",
  drought: "from-orange-500 via-red-400 to-amber-300",
  flood_risk: "from-blue-700 via-blue-500 to-cyan-400",
};

/* ------------------------------------------------------------------ */
/*  Hourly Temperature Chart (pure SVG)                                */
/* ------------------------------------------------------------------ */

function HourlyTempChart({ data }: { data: HourlyPoint[] }) {
  if (!data || data.length < 2) return null;

  const W = 600;
  const H = 120;
  const PAD = { t: 24, b: 20, l: 8, r: 8 };

  const temps = data.map((d) => d.temp);
  const min = Math.min(...temps) - 1;
  const max = Math.max(...temps) + 1;
  const range = max - min || 1;
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  function x(i: number) { return PAD.l + (i / (data.length - 1)) * chartW; }
  function y(v: number) { return PAD.t + chartH - ((v - min) / range) * chartH; }

  const line = data.map((d, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(d.temp)}`).join(" ");
  const area = `${line} L${x(data.length - 1)},${H - PAD.b} L${PAD.l},${H - PAD.b} Z`;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet">
      <defs>
        <linearGradient id="temp-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.3" />
          <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <path d={area} fill="url(#temp-grad)" />
      <path d={line} fill="none" stroke="#f59e0b" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* Dots + labels at every 3rd point */}
      {data.map((d, i) =>
        i % 3 === 0 ? (
          <g key={i}>
            <circle cx={x(i)} cy={y(d.temp)} r="3" fill="#f59e0b" />
            <text x={x(i)} y={y(d.temp) - 8} textAnchor="middle" fontSize="9" className="fill-amber-700 font-medium">
              {d.temp}°
            </text>
          </g>
        ) : null
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Rainfall Bar Chart (pure SVG)                                      */
/* ------------------------------------------------------------------ */

function RainfallChart({ data }: { data: DailyDetail[] }) {
  if (!data || data.length === 0) return null;

  const W = 340;
  const H = 140;
  const PAD = { t: 20, b: 28, l: 36, r: 12 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;

  const maxRain = Math.max(1, ...data.map((d) => d.rain_mm));

  const barW = Math.min(28, (chartW / data.length) * 0.6);
  const gap = (chartW - barW * data.length) / (data.length + 1);

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Rainfall forecast chart">
      {/* Y-axis labels */}
      {[0, 0.5, 1].map((frac) => {
        const val = Math.round(maxRain * frac);
        const yPos = PAD.t + chartH - frac * chartH;
        return (
          <g key={frac}>
            <line x1={PAD.l} y1={yPos} x2={W - PAD.r} y2={yPos} stroke="#e5e7eb" strokeWidth="0.5" strokeDasharray="4,4" />
            <text x={PAD.l - 6} y={yPos + 3} textAnchor="end" fontSize="9" className="fill-gray-400">{val}</text>
          </g>
        );
      })}

      {/* Bars */}
      {data.map((d, i) => {
        const barH = maxRain > 0 ? (d.rain_mm / maxRain) * chartH : 0;
        const bx = PAD.l + gap + i * (barW + gap);
        const by = PAD.t + chartH - barH;
        const dayLabel = new Date(d.date + "T12:00:00").toLocaleDateString("en", { weekday: "short" });
        const hasRain = d.rain_mm > 0;

        return (
          <g key={d.date}>
            <rect x={bx} y={by} width={barW} height={barH} rx={4} fill={hasRain ? "#3b82f6" : "#e5e7eb"} opacity={hasRain ? 0.85 : 0.4} />
            {hasRain && (
              <text x={bx + barW / 2} y={by - 4} textAnchor="middle" fontSize="8" className="fill-blue-600 font-medium">
                {d.rain_mm}mm
              </text>
            )}
            <text x={bx + barW / 2} y={H - 8} textAnchor="middle" fontSize="9" className="fill-gray-500">
              {dayLabel}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/*  Hourly Scroll Strip                                                */
/* ------------------------------------------------------------------ */

function HourlyStrip({ data }: { data: HourlyPoint[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!data || data.length === 0) return null;

  return (
    <div className="relative">
      <div ref={scrollRef} className="flex gap-2 overflow-x-auto pb-2 plot-scroll">
        {data.map((h, i) => {
          const emoji = CONDITION_EMOJI[h.condition] || "☀️";
          const isNow = i === 0;
          return (
            <div
              key={h.time}
              className={`flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 min-w-[56px] flex-shrink-0 ${
                isNow ? "bg-amber-50 border border-amber-200" : "bg-white border border-gray-100"
              }`}
            >
              <span className="text-[10px] font-semibold text-gray-500">
                {isNow ? "Now" : h.time}
              </span>
              <span className="text-lg">{emoji}</span>
              <span className="text-xs font-bold text-gray-800">{h.temp}°</span>
              {h.rain_mm > 0 && (
                <span className="text-[9px] text-blue-500 font-medium">
                  💧{h.rain_mm}mm
                </span>
              )}
            </div>
          );
        })}
      </div>
      {/* Fade edge */}
      <div className="pointer-events-none absolute right-0 top-0 bottom-2 w-8 bg-gradient-to-l from-gray-50 to-transparent" />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  7-Day Forecast Row                                                 */
/* ------------------------------------------------------------------ */

function DailyRow({ day, tempRange }: { day: DailyDetail; tempRange: [number, number] }) {
  const emoji = CONDITION_EMOJI[day.condition] || "☀️";
  const dayName = new Date(day.date + "T12:00:00").toLocaleDateString("en", { weekday: "short" });
  const dateLabel = new Date(day.date + "T12:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" });

  const isToday =
    day.date === new Date().toISOString().split("T")[0];

  // Temp bar position within global range
  const [globalMin, globalMax] = tempRange;
  const globalRange = globalMax - globalMin || 1;
  const leftPct = ((day.temp_min - globalMin) / globalRange) * 100;
  const widthPct = ((day.temp_max - day.temp_min) / globalRange) * 100;

  return (
    <div
      className={`flex items-center gap-2 rounded-xl px-3 py-2.5 ${
        isToday ? "bg-amber-50 border border-amber-100" : ""
      }`}
    >
      {/* Day */}
      <div className="w-10 flex-shrink-0">
        <p className={`text-xs font-semibold ${isToday ? "text-amber-700" : "text-gray-700"}`}>
          {isToday ? "Today" : dayName}
        </p>
        <p className="text-[9px] text-gray-400">{dateLabel}</p>
      </div>

      {/* Icon */}
      <span className="text-xl flex-shrink-0 w-8 text-center">{emoji}</span>

      {/* Rain chance */}
      <div className="w-10 flex-shrink-0 text-center">
        {day.rain_chance > 0 ? (
          <span className="text-[10px] font-medium text-blue-500">
            💧{day.rain_chance}%
          </span>
        ) : (
          <span className="text-[10px] text-gray-300">—</span>
        )}
      </div>

      {/* Temperature bar */}
      <div className="flex-1 flex items-center gap-1.5">
        <span className="text-[10px] text-gray-400 w-6 text-right">{day.temp_min}°</span>
        <div className="relative flex-1 h-1.5 rounded-full bg-gray-100">
          <div
            className="absolute h-full rounded-full"
            style={{
              left: `${leftPct}%`,
              width: `${Math.max(widthPct, 8)}%`,
              background: `linear-gradient(to right, #3b82f6, #f59e0b, #ef4444)`,
            }}
          />
        </div>
        <span className="text-[10px] text-gray-400 w-6">{day.temp_max}°</span>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Spray Conditions Card                                              */
/* ------------------------------------------------------------------ */

function SprayCard({ spray }: { spray: SprayCondition }) {
  const colors = {
    good: { bg: "bg-green-50", border: "border-green-200", text: "text-green-700", badge: "bg-green-500" },
    fair: { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-700", badge: "bg-amber-500" },
    poor: { bg: "bg-red-50", border: "border-red-200", text: "text-red-700", badge: "bg-red-500" },
  };
  const c = colors[spray.condition];

  return (
    <div className={`rounded-2xl border ${c.border} ${c.bg} p-4`}>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Sprout size={18} className={c.text} aria-hidden="true" />
          <h3 className="text-sm font-bold text-gray-800">Spray Conditions</h3>
        </div>
        <span className={`${c.badge} text-white text-[10px] font-bold px-2.5 py-0.5 rounded-full uppercase tracking-wide`}>
          {spray.condition}
        </span>
      </div>
      <p className={`text-xs ${c.text} mb-2`}>{spray.reason}</p>
      <div className="flex gap-4">
        <div className="flex items-center gap-1.5">
          <Wind size={13} className="text-gray-400" aria-hidden="true" />
          <span className="text-xs text-gray-600">{spray.wind} km/h</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Droplets size={13} className="text-gray-400" aria-hidden="true" />
          <span className="text-xs text-gray-600">{spray.humidity}%</span>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function WeatherPage() {
  const router = useRouter();
  const storeFarmId = useFarmStore((s) => s.farm?.id);
  const [resolvedFarmId, setResolvedFarmId] = useState<string | null>(storeFarmId ?? null);
  const [data, setData] = useState<WeatherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve farm ID: use store if available, otherwise fetch from Supabase
  useEffect(() => {
    if (storeFarmId) {
      setResolvedFarmId(storeFarmId);
      return;
    }
    (async () => {
      try {
        const supabase = createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: farms } = await supabase
          .from("farms")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1);
        if (farms && farms.length > 0) {
          setResolvedFarmId(farms[0].id);
        }
      } catch (err) {
        console.error("Failed to resolve farm ID:", err);
      }
    })();
  }, [storeFarmId]);

  const fetchWeather = async (fId: string) => {
    try {
      const res = await fetch(`/api/weather/detail?farm_id=${fId}`);
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch weather detail:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (resolvedFarmId) {
      fetchWeather(resolvedFarmId);
    }
  }, [resolvedFarmId]);

  const handleRefresh = async () => {
    if (!resolvedFarmId) return;
    setRefreshing(true);
    try {
      // Refresh weather from OpenWeatherMap first
      await fetch(`/api/weather?farm_id=${resolvedFarmId}`);
      await fetchWeather(resolvedFarmId);
    } catch (err) {
      console.error("Refresh failed:", err);
    } finally {
      setRefreshing(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 pb-24">
        <div className="h-52 animate-pulse bg-gradient-to-b from-amber-200 to-gray-50" />
        <div className="px-4 space-y-4 mt-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-2xl bg-gray-100 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center gap-4">
        <CloudRain size={48} className="text-gray-300" />
        <p className="text-gray-500">No weather data available</p>
        <button
          onClick={() => router.back()}
          className="text-green-600 font-medium text-sm"
        >
          Go back
        </button>
      </div>
    );
  }

  const { current, hourly, weekly, spray, monsoon, location } = data;
  const emoji = CONDITION_EMOJI[current.condition] || "☀️";
  const label = CONDITION_LABEL[current.condition] || "Sunny";
  const bgGrad = CONDITION_BG[current.condition] || CONDITION_BG.sunny;

  // Global temp range for the week (for bar normalization)
  const allTemps = weekly.flatMap((d) => [d.temp_min, d.temp_max]);
  const tempRange: [number, number] = [
    Math.min(...allTemps),
    Math.max(...allTemps),
  ];

  // Alert conditions
  const alerts: { type: string; message: string; color: string }[] = [];
  if (current.condition === "thunderstorm") {
    alerts.push({ type: "⛈️ Storm Alert", message: "Thunderstorm conditions detected. Secure equipment and avoid open fields.", color: "bg-red-50 border-red-200 text-red-700" });
  }
  if (current.condition === "flood_risk") {
    alerts.push({ type: "🌊 Flood Warning", message: "Heavy rain expected. Check drainage and protect low-lying crops.", color: "bg-blue-50 border-blue-200 text-blue-700" });
  }
  if (current.condition === "drought") {
    alerts.push({ type: "🔥 Drought Warning", message: "High heat and low humidity. Increase irrigation for sensitive crops.", color: "bg-orange-50 border-orange-200 text-orange-700" });
  }
  const highUV = weekly.find((d) => d.uv_index >= 10);
  if (highUV) {
    alerts.push({ type: "☀️ UV Alert", message: "Very high UV index expected. Protect transplants with shade netting.", color: "bg-amber-50 border-amber-200 text-amber-700" });
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Weather"
        action={
          <motion.button
            onClick={handleRefresh}
            whileTap={{ scale: 0.9 }}
            disabled={refreshing}
            className="rounded-full p-2 hover:bg-gray-100 transition-colors disabled:opacity-50"
            aria-label="Refresh weather"
          >
            <RefreshCw size={18} className={`text-gray-500 ${refreshing ? "animate-spin" : ""}`} />
          </motion.button>
        }
      />

      {/* Weather hero */}
      <div className={`relative bg-gradient-to-b ${bgGrad} px-4 pt-4 pb-8`}>
        {/* Location */}
        <p className="text-sm text-white/80 font-medium mb-1">{location}</p>

        {/* Current conditions */}
        <div className="flex items-center gap-4 mb-3">
          <span className="text-5xl">{emoji}</span>
          <div>
            <h1 className="text-5xl font-bold text-white leading-none">
              {current.temp_celsius}°
            </h1>
            <p className="text-lg text-white/90 font-medium">{label}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="flex gap-4 mt-2">
          <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
            <Droplets size={14} className="text-white/80" aria-hidden="true" />
            <span className="text-xs text-white font-medium">{current.humidity_pct}%</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
            <Wind size={14} className="text-white/80" aria-hidden="true" />
            <span className="text-xs text-white font-medium">{current.wind_kmh} km/h</span>
          </div>
          <div className="flex items-center gap-1.5 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
            <CloudRain size={14} className="text-white/80" aria-hidden="true" />
            <span className="text-xs text-white font-medium">{current.rainfall_mm}mm</span>
          </div>
        </div>

        {/* Monsoon badge */}
        <div className="absolute top-4 right-4 rounded-full bg-white/20 px-3 py-1 backdrop-blur-sm">
          <span className="text-[10px] text-white/80 font-medium">{monsoon}</span>
        </div>
      </div>

      {/* Content */}
      <div className="px-4 -mt-4 space-y-4">
        {/* Alerts */}
        <AnimatePresence>
          {alerts.map((alert) => (
            <motion.div
              key={alert.type}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`rounded-xl border p-3 ${alert.color}`}
            >
              <p className="text-xs font-bold">{alert.type}</p>
              <p className="text-[11px] mt-0.5 opacity-80">{alert.message}</p>
            </motion.div>
          ))}
        </AnimatePresence>

        {/* AI Summary */}
        {(() => {
          const parts: string[] = [];
          const goodSpray = current.wind_kmh < 15 && current.humidity_pct < 80;
          if (goodSpray) {
            const cutoff = hourly.find((h) => h.rain_mm > 3);
            parts.push(cutoff ? `Good spray conditions until ${cutoff.time}` : "Good spray conditions all day");
          } else {
            parts.push(`Poor spray conditions \u2014 ${current.wind_kmh >= 15 ? "wind too strong" : "humidity too high"}`);
          }
          const rainyHours = hourly.reduce((s, h) => s + (h.rain_mm > 2 ? 1 : 0), 0);
          if (rainyHours > 3) parts.push(`rain likely for ${rainyHours} hours today \u2014 skip irrigation`);
          else if (current.rainfall_mm < 2) parts.push("no significant rain \u2014 irrigate as planned");
          if (current.humidity_pct > 85) parts.push("high humidity increases fungal disease risk");
          return (
            <div className="px-1 mb-3">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">Farm Impact</p>
              <p className="text-xs text-gray-600 leading-relaxed">{parts.join(". ")}.</p>
            </div>
          );
        })()}

        {/* Hourly forecast */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 mb-3">24-Hour Forecast</h2>
          <HourlyStrip data={hourly} />
          <div className="mt-3">
            <HourlyTempChart data={hourly} />
          </div>
        </div>

        {/* 7-Day forecast */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 mb-3">7-Day Forecast</h2>
          <div className="space-y-0.5">
            {weekly.map((day) => (
              <DailyRow key={day.date} day={day} tempRange={tempRange} />
            ))}
          </div>
        </div>

        {/* Rainfall chart */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-800">Rainfall Forecast</h2>
            <span className="text-[10px] text-gray-400 font-medium">mm per day</span>
          </div>
          <RainfallChart data={weekly} />
        </div>

        {/* Spray conditions */}
        <SprayCard spray={spray} />

        {/* Conditions detail grid */}
        <div className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
          <h2 className="text-sm font-bold text-gray-800 mb-3">Current Details</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-amber-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Thermometer size={14} className="text-amber-600" aria-hidden="true" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Temperature</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{current.temp_celsius}°C</p>
            </div>
            <div className="rounded-xl bg-blue-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Droplets size={14} className="text-blue-500" aria-hidden="true" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Humidity</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{current.humidity_pct}%</p>
            </div>
            <div className="rounded-xl bg-teal-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Wind size={14} className="text-teal-500" aria-hidden="true" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Wind</span>
              </div>
              <p className="text-xl font-bold text-gray-900">{current.wind_kmh} km/h</p>
            </div>
            <div className="rounded-xl bg-violet-50 p-3">
              <div className="flex items-center gap-1.5 mb-1">
                <Sun size={14} className="text-violet-500" aria-hidden="true" />
                <span className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">UV Index</span>
              </div>
              <p className="text-xl font-bold text-gray-900">
                {weekly[0]?.uv_index || "—"}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
