import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlantingPlan } from "@/services/ai/plantingPlanner";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plot_id } = await request.json();
  if (!plot_id) {
    return NextResponse.json({ error: "plot_id required" }, { status: 400 });
  }

  // Fetch plot data
  const { data: plot } = await supabase
    .from("plots")
    .select("id, label, crop_name, growth_stage, planted_date, farm_id")
    .eq("id", plot_id)
    .single();

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Fetch farm, disease history, weather, and market prices in parallel
  const [farmRes, eventsRes, weatherRes, pricesRes] = await Promise.all([
    supabase
      .from("farms")
      .select("district, state, soil_type, water_source, area_acres")
      .eq("id", plot.farm_id)
      .single(),
    supabase
      .from("plot_events")
      .select("event_type, disease_name")
      .eq("plot_id", plot_id)
      .in("event_type", [
        "inspection_disease",
        "inspection_suspicious",
        "inspection_referred",
      ])
      .order("created_at", { ascending: false })
      .limit(3),
    supabase
      .from("weather_snapshots")
      .select("condition, temp_celsius")
      .eq("farm_id", plot.farm_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single(),
    supabase
      .from("market_prices")
      .select("item_name, price_per_kg, trend, trend_pct")
      .eq("item_type", "crop")
      .order("item_name"),
  ]);

  const farm = farmRes.data || {
    district: null,
    state: null,
    soil_type: null,
    water_source: null,
    area_acres: 1,
  };

  const diseaseHistory = (eventsRes.data || []).map((e) => ({
    event_type: e.event_type,
    disease_name: e.disease_name,
  }));

  const weather = weatherRes.data
    ? { condition: weatherRes.data.condition, temp_celsius: weatherRes.data.temp_celsius }
    : null;

  const marketPrices = (pricesRes.data || []).map((m) => ({
    item_name: m.item_name,
    price_per_kg: m.price_per_kg,
    trend: m.trend,
    trend_pct: m.trend_pct,
  }));

  // Generate plan via Genkit flow (passes farmId + plotId for autonomous tool use)
  const plan = await generatePlantingPlan(
    {
      label: plot.label,
      crop_name: plot.crop_name,
      growth_stage: plot.growth_stage,
      planted_date: plot.planted_date,
    },
    farm,
    diseaseHistory,
    weather,
    marketPrices,
    plot.farm_id,
    plot.id
  );

  // Save to planting_plans table
  await supabase.from("planting_plans").insert({
    plot_id,
    farm_id: plot.farm_id,
    crop: plan.recommended_crop,
    plan_json: plan,
  });

  return NextResponse.json({ plan, plot_label: plot.label, plot_id });
}
