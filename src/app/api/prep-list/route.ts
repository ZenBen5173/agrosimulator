import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { calculateResources, calculatePlotAreaM2 } from "@/services/resources/calculator";

/**
 * GET — generate today's resource prep list for a farm.
 * Uses the pure math calculator (no AI needed for quantity calculations).
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // Get farm data
    const { data: farm } = await supabase
      .from("farms")
      .select("id, bounding_box, grid_size")
      .eq("id", farmId)
      .single();

    if (!farm || !farm.bounding_box) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Get active plots
    const { data: plots } = await supabase
      .from("plots")
      .select("id, label, crop_name, growth_stage, risk_score, days_since_checked")
      .eq("farm_id", farmId)
      .eq("is_active", true);

    if (!plots || plots.length === 0) {
      return NextResponse.json({ error: "No active plots" }, { status: 404 });
    }

    // Get grid cells to count per plot
    const { data: gridCells } = await supabase
      .from("grid_cells")
      .select("plot_id")
      .eq("farm_id", farmId)
      .eq("is_active", true)
      .not("plot_id", "is", null);

    const cellCountByPlot = new Map<string, number>();
    for (const cell of gridCells || []) {
      if (cell.plot_id) {
        cellCountByPlot.set(cell.plot_id, (cellCountByPlot.get(cell.plot_id) || 0) + 1);
      }
    }

    // Get latest weather
    const { data: weather } = await supabase
      .from("weather_snapshots")
      .select("rainfall_mm, condition, forecast_json")
      .eq("farm_id", farmId)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    // Get last fertilizer/pesticide dates per plot from plot_events
    const { data: recentEvents } = await supabase
      .from("plot_events")
      .select("plot_id, event_type, created_at")
      .eq("farm_id", farmId)
      .in("event_type", ["fertilized", "treatment_applied"])
      .order("created_at", { ascending: false });

    const lastFertilized = new Map<string, number>();
    const lastPesticide = new Map<string, number>();
    const now = Date.now();

    for (const e of recentEvents || []) {
      const daysSince = Math.floor((now - new Date(e.created_at).getTime()) / 86400000);
      if (e.event_type === "fertilized" && !lastFertilized.has(e.plot_id)) {
        lastFertilized.set(e.plot_id, daysSince);
      }
      if (e.event_type === "treatment_applied" && !lastPesticide.has(e.plot_id)) {
        lastPesticide.set(e.plot_id, daysSince);
      }
    }

    const bb = farm.bounding_box as { north: number; south: number; east: number; west: number };

    // Build plot info for calculator
    const plotInfos = plots.map((p) => ({
      label: p.label,
      crop_name: p.crop_name || "Unknown",
      growth_stage: p.growth_stage || "seedling",
      area_m2: calculatePlotAreaM2(bb, farm.grid_size, cellCountByPlot.get(p.id) || 1),
      risk_score: p.risk_score ?? null,
      days_since_fertilized: lastFertilized.get(p.id) ?? null,
      days_since_pesticide: lastPesticide.get(p.id) ?? null,
    }));

    // Check if rain is forecast in next 3 hours
    const forecast = (weather?.forecast_json || []) as { date: string; condition: string; rain_chance: number }[];
    const rainSoon = forecast.some((f) => f.rain_chance > 60);

    const prepList = calculateResources(plotInfos, {
      rainfall_mm: weather?.rainfall_mm ?? 0,
      condition: weather?.condition ?? "sunny",
      forecast_rain_3h: rainSoon,
    });

    // Save to DB
    const today = new Date().toISOString().split("T")[0];
    await supabase.from("resource_prep_lists").upsert(
      {
        farm_id: farmId,
        date: today,
        prep_list_json: prepList,
        total_estimated_cost_rm: prepList.total_estimated_cost_rm,
        generated_at: new Date().toISOString(),
      },
      { onConflict: "farm_id,date", ignoreDuplicates: false }
    );

    return NextResponse.json(prepList);
  } catch (err) {
    console.error("Prep list error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
