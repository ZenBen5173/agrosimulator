import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { sendPushToUser } from "@/lib/pushNotify";

interface ForecastDay {
  date: string;
  condition: string;
  temp_min: number;
  temp_max: number;
  rain_chance: number;
}

interface WeatherResponse {
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

function mapConditionCode(
  code: number,
  temp: number,
  humidity: number,
  rain3h: number
): string {
  // Thunderstorm
  if (code >= 200 && code <= 232) return "thunderstorm";
  // Rain
  if (code >= 500 && code <= 531) {
    if (rain3h > 20) return "flood_risk";
    return "rainy";
  }
  // Drizzle
  if (code >= 300 && code <= 321) return "rainy";
  // Clear
  if (code === 800) {
    if (temp > 35 && humidity < 30) return "drought";
    return "sunny";
  }
  // Clouds
  if (code >= 801 && code <= 804) return "overcast";
  return "sunny";
}

function getMockWeather(): WeatherResponse {
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const today = new Date();
  const forecast: ForecastDay[] = [];
  for (let i = 0; i < 5; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    forecast.push({
      date: d.toISOString().split("T")[0],
      condition: i === 2 ? "rainy" : i === 4 ? "overcast" : "sunny",
      temp_min: 24 + Math.floor(Math.random() * 3),
      temp_max: 30 + Math.floor(Math.random() * 4),
      rain_chance: i === 2 ? 80 : i === 4 ? 40 : 10,
    });
  }
  void days; // used for reference
  return {
    condition: "sunny",
    temp_celsius: 28,
    humidity_pct: 75,
    rainfall_mm: 0,
    wind_kmh: 12,
    forecast,
  };
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");

    if (!farmId) {
      return NextResponse.json(
        { error: "farm_id is required" },
        { status: 400 }
      );
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: farm } = await supabase
      .from("farms")
      .select("bounding_box, district")
      .eq("id", farmId)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    const apiKey = process.env.OPENWEATHERMAP_API_KEY;
    if (!apiKey || apiKey === "your_openweathermap_api_key_here") {
      console.warn("OPENWEATHERMAP_API_KEY not set, using mock weather");
      const mock = getMockWeather();

      // Save mock snapshot
      const today = new Date().toISOString().split("T")[0];
      const { data: existing } = await supabase
        .from("weather_snapshots")
        .select("id")
        .eq("farm_id", farmId)
        .gte("fetched_at", today + "T00:00:00Z")
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("weather_snapshots").insert({
          farm_id: farmId,
          condition: mock.condition,
          temp_celsius: mock.temp_celsius,
          humidity_pct: mock.humidity_pct,
          rainfall_mm: mock.rainfall_mm,
          wind_kmh: mock.wind_kmh,
          forecast_json: mock.forecast,
        });
      }

      return NextResponse.json(mock);
    }

    const bb = farm.bounding_box as {
      north: number;
      south: number;
      east: number;
      west: number;
    };
    const lat = ((bb.north + bb.south) / 2).toFixed(4);
    const lng = ((bb.east + bb.west) / 2).toFixed(4);

    // Fetch current weather + forecast in parallel
    const [currentRes, forecastRes] = await Promise.all([
      fetch(
        `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric`
      ),
      fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lng}&appid=${apiKey}&units=metric&cnt=40`
      ),
    ]);

    if (!currentRes.ok || !forecastRes.ok) {
      console.error("OpenWeatherMap API error, using mock");
      return NextResponse.json(getMockWeather());
    }

    const current = await currentRes.json();
    const forecastData = await forecastRes.json();

    const code = current.weather?.[0]?.id || 800;
    const temp = current.main?.temp || 28;
    const humidity = current.main?.humidity || 70;
    const rain3h = current.rain?.["3h"] || 0;
    const wind = current.wind?.speed ? current.wind.speed * 3.6 : 0; // m/s to km/h

    let condition = mapConditionCode(code, temp, humidity, rain3h);

    // Check forecast for flood risk: heavy rain 3+ consecutive periods
    if (condition === "rainy" && forecastData.list) {
      let consecutiveHeavy = 0;
      for (const item of forecastData.list.slice(0, 8)) {
        const itemRain = item.rain?.["3h"] || 0;
        if (itemRain > 10) {
          consecutiveHeavy++;
          if (consecutiveHeavy >= 3) {
            condition = "flood_risk";
            break;
          }
        } else {
          consecutiveHeavy = 0;
        }
      }
    }

    // Build 5-day forecast — pick noon reading per day
    const forecast: ForecastDay[] = [];
    const dayMap = new Map<string, typeof forecastData.list>();

    if (forecastData.list) {
      for (const item of forecastData.list) {
        const date = item.dt_txt?.split(" ")[0];
        if (!date) continue;
        if (!dayMap.has(date)) dayMap.set(date, []);
        dayMap.get(date)!.push(item);
      }
    }

    let dayCount = 0;
    for (const [date, items] of dayMap) {
      if (dayCount >= 5) break;
      // Find noon reading or middle entry
      const noon =
        items.find((i: { dt_txt: string }) =>
          i.dt_txt.includes("12:00:00")
        ) || items[Math.floor(items.length / 2)];

      const temps = items.map(
        (i: { main: { temp: number } }) => i.main.temp
      );
      const rainChance = items.some(
        (i: { rain?: { "3h": number } }) => (i.rain?.["3h"] || 0) > 0
      )
        ? Math.round(
            (items.filter(
              (i: { rain?: { "3h": number } }) => (i.rain?.["3h"] || 0) > 0
            ).length /
              items.length) *
              100
          )
        : 0;

      const noonCode = noon.weather?.[0]?.id || 800;
      const noonTemp = noon.main?.temp || 28;
      const noonHumidity = noon.main?.humidity || 70;
      const noonRain = noon.rain?.["3h"] || 0;

      forecast.push({
        date,
        condition: mapConditionCode(
          noonCode,
          noonTemp,
          noonHumidity,
          noonRain
        ),
        temp_min: Math.round(Math.min(...temps)),
        temp_max: Math.round(Math.max(...temps)),
        rain_chance: rainChance,
      });
      dayCount++;
    }

    const result: WeatherResponse = {
      condition,
      temp_celsius: Math.round(temp),
      humidity_pct: Math.round(humidity),
      rainfall_mm: Math.round(rain3h * 10) / 10,
      wind_kmh: Math.round(wind),
      forecast,
    };

    // Save snapshot — one per day
    const today = new Date().toISOString().split("T")[0];
    const { data: existing } = await supabase
      .from("weather_snapshots")
      .select("id")
      .eq("farm_id", farmId)
      .gte("fetched_at", today + "T00:00:00Z")
      .limit(1);

    if (!existing || existing.length === 0) {
      await supabase.from("weather_snapshots").insert({
        farm_id: farmId,
        condition: result.condition,
        temp_celsius: result.temp_celsius,
        humidity_pct: result.humidity_pct,
        rainfall_mm: result.rainfall_mm,
        wind_kmh: result.wind_kmh,
        forecast_json: result.forecast,
      });
    }

    // Send push for severe weather (non-blocking)
    if (
      result.condition === "thunderstorm" ||
      result.condition === "flood_risk"
    ) {
      const label =
        result.condition === "thunderstorm" ? "Thunderstorm" : "Flood Risk";
      sendPushToUser(user.id, {
        title: `Weather Warning: ${label}`,
        body: `${label} conditions detected near your farm. Take precautions to protect your crops.`,
        url: "/home",
        tag: "weather-alert",
      }).catch(() => {});
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Weather API error:", err);
    return NextResponse.json(getMockWeather());
  }
}
