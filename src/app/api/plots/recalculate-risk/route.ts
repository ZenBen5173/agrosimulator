import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { assessRisk } from "@/services/ai/riskScoring";

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

    // Fetch plots
    const { data: plots } = await supabase
      .from("plots")
      .select(
        "id, label, crop_name, growth_stage, planted_date, days_since_checked, warning_level"
      )
      .eq("farm_id", farm_id);

    if (!plots || plots.length === 0) {
      return NextResponse.json({ plots: [] });
    }

    // Fetch last 7 weather snapshots
    const { data: weatherSnaps } = await supabase
      .from("weather_snapshots")
      .select("condition, temp_celsius, humidity_pct, rainfall_mm")
      .eq("farm_id", farm_id)
      .order("fetched_at", { ascending: false })
      .limit(7);

    const weatherHistory = (weatherSnaps || []).map((w) => ({
      condition: w.condition,
      temp_celsius: w.temp_celsius,
      humidity_pct: w.humidity_pct,
      rainfall_mm: w.rainfall_mm,
    }));

    // Fetch last 5 plot_events per plot
    const plotIds = plots.map((p) => p.id);
    const { data: allEvents } = await supabase
      .from("plot_events")
      .select("plot_id, event_type, disease_name, severity, created_at")
      .in("plot_id", plotIds)
      .order("created_at", { ascending: false })
      .limit(50);

    // Group events by plot_id, max 5 per plot
    const eventsByPlot: Record<
      string,
      { event_type: string; disease_name: string | null; severity: string | null; created_at: string }[]
    > = {};
    for (const e of allEvents || []) {
      if (!eventsByPlot[e.plot_id]) eventsByPlot[e.plot_id] = [];
      if (eventsByPlot[e.plot_id].length < 5) {
        eventsByPlot[e.plot_id].push({
          event_type: e.event_type,
          disease_name: e.disease_name,
          severity: e.severity,
          created_at: e.created_at,
        });
      }
    }

    // Build plot input
    const plotInput = plots.map((p) => ({
      label: p.label,
      crop_name: p.crop_name,
      growth_stage: p.growth_stage,
      days_since_checked: p.days_since_checked,
      recent_events: eventsByPlot[p.id] || [],
    }));

    // Call Gemini risk assessment
    const riskResults = await assessRisk(plotInput, weatherHistory);

    // Update plots and insert events
    const labelToId: Record<string, string> = {};
    for (const p of plots) {
      labelToId[p.label] = p.id;
    }

    const now = new Date().toISOString();
    const eventRows: {
      plot_id: string;
      farm_id: string;
      event_type: string;
      notes: string;
      created_at: string;
    }[] = [];

    for (const r of riskResults) {
      const plotId = labelToId[r.label];
      if (!plotId) continue;

      await supabase
        .from("plots")
        .update({
          risk_score: r.risk_score,
          warning_level: r.warning_level,
          warning_reason: r.warning_reason,
          updated_at: now,
        })
        .eq("id", plotId);

      eventRows.push({
        plot_id: plotId,
        farm_id,
        event_type: "ai_risk_recalc",
        notes: r.warning_reason,
        created_at: now,
      });
    }

    if (eventRows.length > 0) {
      await supabase.from("plot_events").insert(eventRows);
    }

    return NextResponse.json({ plots: riskResults });
  } catch (err) {
    console.error("Risk recalculation error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
