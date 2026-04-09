import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Returns detailed weather data including simulated hourly forecasts
 * and additional agricultural metrics for the weather detail page.
 */

interface HourlyPoint {
  time: string;       // HH:mm
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

function mapConditionCode(code: number, temp: number, humidity: number, rain3h: number): string {
  if (code >= 200 && code <= 232) return "thunderstorm";
  if (code >= 500 && code <= 531) {
    if (rain3h > 20) return "flood_risk";
    return "rainy";
  }
  if (code >= 300 && code <= 321) return "rainy";
  if (code === 800) {
    if (temp > 35 && humidity < 30) return "drought";
    return "sunny";
  }
  if (code >= 801 && code <= 804) return "overcast";
  return "sunny";
}

/** Seeded pseudo-random for deterministic hourly data */
function seededRand(seed: number): number {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/**
 * Generate realistic 24-hour forecast from current conditions.
 * Malaysian tropical pattern: warm mornings, hot midday, afternoon rain risk, warm evening.
 */
function generateHourly(
  baseTemp: number,
  baseHumidity: number,
  baseWind: number,
  baseRain: number,
  condition: string,
  daySeed: number
): HourlyPoint[] {
  const hours: HourlyPoint[] = [];
  const now = new Date();
  const currentHour = now.getHours();

  for (let h = 0; h < 24; h++) {
    const hour = (currentHour + h) % 24;
    const r = seededRand(daySeed * 100 + h);

    // Tropical temperature curve: coolest at 5-6am, hottest at 1-2pm
    const tempOffset =
      hour >= 0 && hour < 6
        ? -3 + (hour / 6) * 1
        : hour >= 6 && hour < 14
          ? -2 + ((hour - 6) / 8) * 6
          : hour >= 14 && hour < 20
            ? 4 - ((hour - 14) / 6) * 5
            : -1 - ((hour - 20) / 4) * 2;

    const temp = Math.round((baseTemp + tempOffset + (r - 0.5) * 2) * 10) / 10;

    // Humidity: inverse of temp roughly, higher at night/rain
    const humidityBase =
      hour >= 6 && hour < 14
        ? baseHumidity - 10
        : baseHumidity + 5;
    const humidity = Math.min(98, Math.max(40, Math.round(humidityBase + (r - 0.5) * 10)));

    // Wind varies more midday
    const windMult = hour >= 10 && hour < 16 ? 1.3 : 0.8;
    const wind = Math.max(0, Math.round(baseWind * windMult + (r - 0.5) * 6));

    // Rain: tropical afternoon pattern (highest 14:00-18:00)
    let rainProb = 0;
    if (condition === "rainy" || condition === "thunderstorm" || condition === "flood_risk") {
      rainProb = hour >= 14 && hour <= 18 ? 0.7 : hour >= 12 && hour <= 20 ? 0.4 : 0.1;
    } else if (condition === "overcast") {
      rainProb = hour >= 14 && hour <= 17 ? 0.3 : 0.05;
    } else {
      rainProb = hour >= 15 && hour <= 17 ? 0.15 : 0.02;
    }
    const rain = r < rainProb ? Math.round((r * 8 + baseRain * 0.3) * 10) / 10 : 0;

    // Condition per hour
    let hourCondition = condition;
    if (rain > 2) hourCondition = "rainy";
    else if (rain > 0) hourCondition = "overcast";
    else if (hour >= 6 && hour < 18) hourCondition = humidity > 85 ? "overcast" : "sunny";
    else hourCondition = "overcast";

    const displayHour = (currentHour + h) % 24;
    hours.push({
      time: `${displayHour.toString().padStart(2, "0")}:00`,
      temp,
      humidity,
      wind_kmh: wind,
      rain_mm: rain,
      condition: hourCondition,
    });
  }

  return hours;
}

/**
 * Generate 7-day detailed forecast from the base 5-day data.
 */
function generateWeekly(
  forecast: { date: string; condition: string; temp_min: number; temp_max: number; rain_chance: number }[],
  baseHumidity: number,
  baseWind: number
): DailyDetail[] {
  const days: DailyDetail[] = [];
  const today = new Date();

  for (let d = 0; d < 7; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];
    const r = seededRand(d * 777 + 42);

    const existing = forecast.find((f) => f.date === dateStr);

    if (existing) {
      days.push({
        date: existing.date,
        condition: existing.condition,
        temp_min: existing.temp_min,
        temp_max: existing.temp_max,
        rain_chance: existing.rain_chance,
        rain_mm:
          existing.rain_chance > 50
            ? Math.round(r * 15 + 5)
            : existing.rain_chance > 20
              ? Math.round(r * 5)
              : 0,
        humidity_avg: Math.round(baseHumidity + (r - 0.5) * 15),
        wind_avg: Math.round(baseWind + (r - 0.5) * 8),
        uv_index:
          existing.condition === "sunny"
            ? Math.round(8 + r * 4)
            : existing.condition === "overcast"
              ? Math.round(4 + r * 3)
              : Math.round(2 + r * 2),
      });
    } else {
      // Extend beyond 5-day with simulated data
      const conditions = ["sunny", "overcast", "rainy", "sunny", "overcast"];
      const cond = conditions[d % conditions.length];
      const isRainy = cond === "rainy";
      days.push({
        date: dateStr,
        condition: cond,
        temp_min: Math.round(24 + r * 3),
        temp_max: Math.round(30 + r * 4),
        rain_chance: isRainy ? Math.round(50 + r * 40) : Math.round(r * 25),
        rain_mm: isRainy ? Math.round(r * 15 + 3) : 0,
        humidity_avg: Math.round(baseHumidity + (r - 0.5) * 15),
        wind_avg: Math.round(baseWind + (r - 0.5) * 8),
        uv_index: cond === "sunny" ? Math.round(8 + r * 4) : Math.round(3 + r * 3),
      });
    }
  }

  return days;
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");

    if (!farmId) {
      return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch latest weather snapshot from DB
    const { data: snapshot } = await supabase
      .from("weather_snapshots")
      .select("*")
      .eq("farm_id", farmId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    // Also fetch farm location for display
    const { data: farm } = await supabase
      .from("farms")
      .select("name, district, state")
      .eq("id", farmId)
      .single();

    if (!snapshot) {
      return NextResponse.json({ error: "No weather data available" }, { status: 404 });
    }

    const forecast = (snapshot.forecast_json || []) as {
      date: string;
      condition: string;
      temp_min: number;
      temp_max: number;
      rain_chance: number;
    }[];

    const daySeed = new Date().getDate() * 31 + new Date().getMonth() * 12;

    // Generate detailed data
    const hourly = generateHourly(
      snapshot.temp_celsius,
      snapshot.humidity_pct,
      snapshot.wind_kmh,
      snapshot.rainfall_mm,
      snapshot.condition,
      daySeed
    );

    const weekly = generateWeekly(forecast, snapshot.humidity_pct, snapshot.wind_kmh);

    // Spray conditions: based on wind and humidity
    const sprayWind = snapshot.wind_kmh;
    const sprayHumidity = snapshot.humidity_pct;
    let sprayCondition: "good" | "fair" | "poor" = "good";
    let sprayReason = "";

    if (sprayWind > 20 || snapshot.condition === "rainy" || snapshot.condition === "thunderstorm") {
      sprayCondition = "poor";
      sprayReason =
        sprayWind > 20
          ? "Wind too strong for spraying"
          : "Rain will wash away chemicals";
    } else if (sprayWind > 12 || sprayHumidity > 90 || snapshot.condition === "flood_risk") {
      sprayCondition = "fair";
      sprayReason =
        sprayWind > 12
          ? "Moderate wind — spray with caution"
          : "High humidity — reduced effectiveness";
    } else {
      sprayReason = "Good conditions for spraying";
    }

    // Determine monsoon season (Malaysia)
    const month = new Date().getMonth() + 1; // 1-12
    let monsoon = "Inter-monsoon";
    if (month >= 11 || month <= 3) monsoon = "Northeast Monsoon";
    else if (month >= 5 && month <= 9) monsoon = "Southwest Monsoon";

    return NextResponse.json({
      current: {
        condition: snapshot.condition,
        temp_celsius: snapshot.temp_celsius,
        humidity_pct: snapshot.humidity_pct,
        rainfall_mm: snapshot.rainfall_mm,
        wind_kmh: snapshot.wind_kmh,
        fetched_at: snapshot.fetched_at,
      },
      location: farm
        ? [farm.name, farm.district, farm.state].filter(Boolean).join(", ") || "Your Farm"
        : "Your Farm",
      hourly,
      weekly,
      spray: {
        condition: sprayCondition,
        reason: sprayReason,
        wind: sprayWind,
        humidity: sprayHumidity,
      },
      monsoon,
    });
  } catch (err) {
    console.error("Weather detail error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
