import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Vercel Cron Job — runs daily at 6 AM.
 * Detects weather patterns and creates deterministic alerts (no AI needed).
 */
export async function GET(request: Request) {
  try {
    const authHeader = request.headers.get("authorization");
    if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = await createClient();
    const sevenDaysAgo = new Date(Date.now() - 7 * 86400000).toISOString();

    // Get all farms with recent weather data
    const { data: farms } = await supabase
      .from("farms")
      .select("id, district, state");

    if (!farms || farms.length === 0) {
      return NextResponse.json({ message: "No farms" });
    }

    let alertsCreated = 0;

    for (const farm of farms) {
      // Get last 7 days of weather
      const { data: weatherHistory } = await supabase
        .from("weather_snapshots")
        .select("condition, temp_celsius, humidity_pct, rainfall_mm")
        .eq("farm_id", farm.id)
        .gte("fetched_at", sevenDaysAgo)
        .order("fetched_at", { ascending: false });

      if (!weatherHistory || weatherHistory.length === 0) continue;

      const alerts: { title: string; summary: string; severity: string; action: string }[] = [];

      // Pattern 1: 4+ consecutive rain days → fungal risk
      const rainyDays = weatherHistory.filter(
        (w) => w.condition === "rainy" || w.condition === "thunderstorm"
      ).length;
      if (rainyDays >= 4) {
        alerts.push({
          title: "Fungal disease risk — extended rain",
          summary: `${rainyDays} rainy days in the last week. Fungal infection risk is elevated for all crops.`,
          severity: rainyDays >= 6 ? "high" : "medium",
          action: "Inspect all plots for early signs of fungal infection. Consider preventive fungicide application.",
        });
      }

      // Pattern 2: 7+ dry days + temp > 33°C → drought
      const hotDryDays = weatherHistory.filter(
        (w) => w.condition === "sunny" && w.temp_celsius > 33 && w.rainfall_mm < 1
      ).length;
      if (hotDryDays >= 5) {
        alerts.push({
          title: "Drought stress forming",
          summary: `${hotDryDays} hot dry days (>33°C). Crops may be under water stress.`,
          severity: hotDryDays >= 7 ? "high" : "medium",
          action: "Increase watering frequency. Water in early morning or late evening to reduce evaporation.",
        });
      }

      // Pattern 3: Humidity > 85% for 3+ days → disease pressure
      const humidDays = weatherHistory.filter((w) => w.humidity_pct > 85).length;
      if (humidDays >= 3 && rainyDays < 4) {
        alerts.push({
          title: "High humidity — disease pressure",
          summary: `Humidity above 85% for ${humidDays} days. Bacterial and fungal diseases spread faster in these conditions.`,
          severity: "medium",
          action: "Improve ventilation around crops. Avoid overhead watering. Scout for early disease symptoms.",
        });
      }

      // Pattern 4: Heavy rainfall forecast
      const heavyRain = weatherHistory.find((w) => w.rainfall_mm > 50);
      if (heavyRain) {
        alerts.push({
          title: "Flood risk — heavy rainfall detected",
          summary: `Rainfall of ${heavyRain.rainfall_mm}mm recorded. Check drainage and protect low-lying plots.`,
          severity: "high",
          action: "Clear drainage channels. Move equipment to higher ground. Delay pesticide application.",
        });
      }

      // Insert alerts with dedup
      for (const alert of alerts) {
        const dedupKey = `weather:${alert.title}:${farm.id}`;
        const { data: existing } = await supabase
          .from("farm_alerts")
          .select("id")
          .eq("dedup_key", dedupKey)
          .gte("created_at", sevenDaysAgo)
          .limit(1);

        if (!existing || existing.length === 0) {
          await supabase.from("farm_alerts").insert({
            farm_id: farm.id,
            alert_type: "weather_warning",
            title: alert.title,
            summary: alert.summary,
            severity: alert.severity,
            affected_crops: [],
            recommended_action: alert.action,
            source_type: "weather_pattern",
            dedup_key: dedupKey,
          });
          alertsCreated++;
        }
      }
    }

    return NextResponse.json({ farms_checked: farms.length, alerts_created: alertsCreated });
  } catch (err) {
    console.error("Weather patterns cron error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
