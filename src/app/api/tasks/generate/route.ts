import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generateTasks } from "@/services/ai/taskGenerator";

export async function POST(request: Request) {
  try {
    const { farm_id } = await request.json();

    if (!farm_id) {
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

    // Fetch farm details
    const { data: farm } = await supabase
      .from("farms")
      .select("id, soil_type, water_source, district, state")
      .eq("id", farm_id)
      .single();

    if (!farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Check if we already generated tasks today
    const today = new Date().toISOString().split("T")[0];
    const { data: existingTasks } = await supabase
      .from("tasks")
      .select("id")
      .eq("farm_id", farm_id)
      .eq("auto_generated", true)
      .gte("created_at", today + "T00:00:00Z")
      .limit(1);

    if (existingTasks && existingTasks.length > 0) {
      // Already generated today — return existing tasks
      const { data: tasks } = await supabase
        .from("tasks")
        .select("*")
        .eq("farm_id", farm_id)
        .eq("completed", false)
        .order("priority")
        .order("created_at", { ascending: false });

      return NextResponse.json({ tasks: tasks || [], generated: false });
    }

    // Fetch plots with details
    const { data: plots } = await supabase
      .from("plots")
      .select(
        "id, label, crop_name, growth_stage, planted_date, expected_harvest, warning_level, days_since_checked"
      )
      .eq("farm_id", farm_id);

    if (!plots || plots.length === 0) {
      return NextResponse.json({ tasks: [], generated: false });
    }

    // Fetch latest weather snapshot
    const { data: weatherSnap } = await supabase
      .from("weather_snapshots")
      .select("condition, temp_celsius, humidity_pct, rainfall_mm, wind_kmh, forecast_json")
      .eq("farm_id", farm_id)
      .order("fetched_at", { ascending: false })
      .limit(1)
      .single();

    const weather = weatherSnap
      ? {
          condition: weatherSnap.condition,
          temp_celsius: weatherSnap.temp_celsius,
          humidity_pct: weatherSnap.humidity_pct,
          rainfall_mm: weatherSnap.rainfall_mm,
          wind_kmh: weatherSnap.wind_kmh,
          forecast: weatherSnap.forecast_json as
            | { date: string; condition: string; rain_chance: number }[]
            | undefined,
        }
      : null;

    // Build plot input
    const plotInput = plots.map((p) => ({
      label: p.label,
      crop_name: p.crop_name,
      growth_stage: p.growth_stage,
      planted_date: p.planted_date,
      expected_harvest: p.expected_harvest,
      warning_level: p.warning_level || "none",
      days_since_checked: p.days_since_checked,
    }));

    // Generate tasks via Gemini
    const generated = await generateTasks(
      plotInput,
      weather,
      farm.soil_type || "loam",
      farm.water_source || "rain_fed"
    );

    // Map plot labels to IDs
    const labelToId: Record<string, string> = {};
    for (const p of plots) {
      labelToId[p.label] = p.id;
    }

    // Insert tasks into DB
    const taskRows = generated.map((t) => ({
      farm_id,
      plot_id: t.plot_label ? labelToId[t.plot_label] || null : null,
      title: t.title,
      description: t.description,
      task_type: t.task_type,
      priority: t.priority,
      due_date: today,
      completed: false,
      auto_generated: true,
      triggered_by: t.triggered_by,
    }));

    const { data: inserted, error: insertError } = await supabase
      .from("tasks")
      .insert(taskRows)
      .select("*");

    if (insertError) {
      console.error("Failed to insert tasks:", insertError);
      return NextResponse.json(
        { error: "Failed to save tasks" },
        { status: 500 }
      );
    }

    // Add plot_label to response for UI display
    const idToLabel: Record<string, string> = {};
    for (const p of plots) {
      idToLabel[p.id] = p.label;
    }

    const tasksWithLabels = (inserted || []).map((t) => ({
      ...t,
      plot_label: t.plot_id ? idToLabel[t.plot_id] || null : null,
    }));

    return NextResponse.json({ tasks: tasksWithLabels, generated: true });
  } catch (err) {
    console.error("Task generation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
