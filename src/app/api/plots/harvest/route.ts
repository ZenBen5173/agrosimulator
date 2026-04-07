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

  const { plot_id } = await request.json();
  if (!plot_id) {
    return NextResponse.json({ error: "plot_id required" }, { status: 400 });
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

  // Update plot to harvested
  const { error: updateErr } = await supabase
    .from("plots")
    .update({
      growth_stage: "harvested",
      warning_level: "none",
      warning_reason: null,
      risk_score: 0,
      updated_at: new Date().toISOString(),
    })
    .eq("id", plot_id);

  if (updateErr) {
    return NextResponse.json(
      { error: "Failed to update plot" },
      { status: 500 }
    );
  }

  // Insert harvested event
  await supabase.from("plot_events").insert({
    plot_id,
    farm_id: plot.farm_id,
    event_type: "harvested",
  });

  return NextResponse.json({ success: true });
}
