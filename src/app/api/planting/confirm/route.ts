import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { plot_id, crop_name, planted_date, expected_harvest } =
    await request.json();

  if (!plot_id || !crop_name) {
    return NextResponse.json(
      { error: "plot_id and crop_name required" },
      { status: 400 }
    );
  }

  // Fetch plot to get farm_id
  const { data: plot } = await supabase
    .from("plots")
    .select("id, farm_id")
    .eq("id", plot_id)
    .single();

  if (!plot) {
    return NextResponse.json({ error: "Plot not found" }, { status: 404 });
  }

  // Update plot with new crop
  const { error: updateErr } = await supabase
    .from("plots")
    .update({
      crop_name,
      growth_stage: "seedling",
      planted_date: planted_date || new Date().toISOString().split("T")[0],
      expected_harvest: expected_harvest || null,
      warning_level: "none",
      warning_reason: null,
      risk_score: 0,
      days_since_checked: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", plot_id);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to update plot" },
      { status: 500 }
    );
  }

  // Insert plot_event for replanted
  await supabase.from("plot_events").insert({
    plot_id,
    farm_id: plot.farm_id,
    event_type: "replanted",
    notes: crop_name,
  });

  // Generate fresh tasks (non-blocking)
  try {
    await fetch(
      new URL("/api/tasks/generate", request.url).toString(),
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: plot.farm_id }),
      }
    );
  } catch {
    // Non-critical
  }

  return NextResponse.json({ success: true });
}
