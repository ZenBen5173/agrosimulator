"use client";

/**
 * AgroSim 2.0 — Weather page.
 * Clean 7-day forecast + spray-condition advice for the farmer's location.
 */

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Droplets,
  Wind,
  Sun,
  CloudRain,
  Cloud,
  CloudLightning,
  Sprout,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";
import { createClient } from "@/lib/supabase/client";

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

const CONDITION_ICON: Record<string, typeof Sun> = {
  sunny: Sun,
  overcast: Cloud,
  rainy: CloudRain,
  thunderstorm: CloudLightning,
  drought: Sun,
  flood_risk: CloudRain,
};

const SPRAY_COLOUR = {
  good: "bg-emerald-50 border-emerald-300 text-emerald-900",
  fair: "bg-amber-50 border-amber-300 text-amber-900",
  poor: "bg-red-50 border-red-300 text-red-900",
} as const;

function dayName(iso: string, idx: number): string {
  if (idx === 0) return "Today";
  if (idx === 1) return "Tomorrow";
  return new Date(iso).toLocaleDateString("en-MY", { weekday: "short" });
}

export default function WeatherPage() {
  const router = useRouter();
  const storeFarmId = useFarmStore((s) => s.farm?.id);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [data, setData] = useState<WeatherDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Resolve farm via Supabase if Zustand is empty
  useEffect(() => {
    if (storeFarmId) {
      setFarmId(storeFarmId);
      return;
    }
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        setLoading(false);
        return;
      }
      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) setFarmId(farm.id);
      else setLoading(false);
    });
  }, [storeFarmId]);

  const fetchWeather = useCallback(async () => {
    if (!farmId) return;
    setRefreshing(true);
    try {
      const res = await fetch(`/api/weather/detail?farm_id=${farmId}`);
      if (res.ok) setData(await res.json());
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [farmId]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center justify-between">
          <div className="flex items-center gap-2">
            <button onClick={() => router.back()} aria-label="Back">
              <ArrowLeft size={18} className="text-stone-500" />
            </button>
            <div>
              <h1 className="text-lg font-semibold text-stone-900">Weather</h1>
              <p className="text-[11px] leading-none text-stone-500">
                {data?.location ?? "Loading location…"}
              </p>
            </div>
          </div>
          <button
            onClick={fetchWeather}
            disabled={refreshing}
            aria-label="Refresh"
            className="rounded-lg p-2 hover:bg-stone-100 disabled:opacity-50"
          >
            <RefreshCw
              size={16}
              className={`text-stone-500 ${refreshing ? "animate-spin" : ""}`}
            />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {loading && !data ? (
          <div className="flex items-center justify-center rounded-xl border border-stone-200 bg-white py-16">
            <Loader2 size={20} className="animate-spin text-emerald-600" />
          </div>
        ) : !data ? (
          <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            Couldn&apos;t load the weather right now.
          </div>
        ) : (
          <>
            <CurrentCard current={data.current} />
            <SprayCard spray={data.spray} />
            <ForecastCard weekly={data.weekly} />
            {data.monsoon && (
              <section className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900">
                <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
                  <Droplets size={12} />
                  Seasonal context
                </div>
                <p>{data.monsoon}</p>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CurrentCard({ current }: { current: WeatherDetail["current"] }) {
  const Icon = CONDITION_ICON[current.condition] ?? Cloud;
  return (
    <section className="rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Icon size={26} />
          </span>
          <div>
            <p className="text-3xl font-semibold text-stone-900">
              {Math.round(current.temp_celsius)}°
            </p>
            <p className="text-xs capitalize text-stone-600">{current.condition}</p>
          </div>
        </div>
        <div className="text-right text-xs text-stone-500">
          <div className="flex items-center justify-end gap-1">
            <Droplets size={12} /> {Math.round(current.humidity_pct)}%
          </div>
          <div className="mt-1 flex items-center justify-end gap-1">
            <Wind size={12} /> {Math.round(current.wind_kmh)} km/h
          </div>
          {current.rainfall_mm > 0 && (
            <div className="mt-1 flex items-center justify-end gap-1 text-blue-600">
              <CloudRain size={12} /> {current.rainfall_mm.toFixed(1)} mm
            </div>
          )}
        </div>
      </div>
      <p className="mt-3 text-[10px] text-stone-400">
        Updated{" "}
        {new Date(current.fetched_at).toLocaleTimeString("en-MY", {
          hour: "2-digit",
          minute: "2-digit",
        })}
      </p>
    </section>
  );
}

function SprayCard({ spray }: { spray: SprayCondition }) {
  const cls = SPRAY_COLOUR[spray.condition];
  return (
    <section className={`rounded-xl border p-4 ${cls}`}>
      <div className="mb-1 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-wide">
        <Sprout size={12} />
        Spray conditions today
      </div>
      <p className="text-sm font-medium capitalize">{spray.condition}</p>
      <p className="mt-1 text-xs">{spray.reason}</p>
      <p className="mt-2 text-[11px] opacity-80">
        Wind {spray.wind} km/h · humidity {spray.humidity}%
      </p>
    </section>
  );
}

function ForecastCard({ weekly }: { weekly: DailyDetail[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="border-b border-stone-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-stone-800">7-day forecast</h2>
      </div>
      <ul className="divide-y divide-stone-100">
        {weekly.map((d, i) => {
          const Icon = CONDITION_ICON[d.condition] ?? Cloud;
          return (
            <li key={d.date} className="flex items-center gap-3 px-4 py-3 text-sm">
              <span className="w-16 flex-shrink-0 text-stone-700">
                {dayName(d.date, i)}
              </span>
              <Icon size={18} className="flex-shrink-0 text-amber-600" />
              <span className="min-w-0 flex-1 truncate text-xs capitalize text-stone-500">
                {d.condition}
              </span>
              {d.rain_chance > 30 && (
                <span className="flex flex-shrink-0 items-center gap-0.5 text-[11px] text-blue-600">
                  <CloudRain size={11} /> {Math.round(d.rain_chance)}%
                </span>
              )}
              <span className="w-20 flex-shrink-0 text-right text-stone-700">
                <span className="font-medium text-stone-900">
                  {Math.round(d.temp_max)}°
                </span>
                <span className="text-stone-400"> / {Math.round(d.temp_min)}°</span>
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
