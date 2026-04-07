import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  try {
    const { farm_id, plot_id, photo_urls } = await request.json();

    if (!farm_id || !plot_id) {
      return NextResponse.json(
        { error: "farm_id and plot_id are required" },
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

    // Insert clean inspection event
    await supabase.from("plot_events").insert({
      plot_id,
      farm_id,
      event_type: "inspection_clean",
      photo_url: Array.isArray(photo_urls) ? photo_urls[0] : null,
    });

    // Update plot — clear warnings, reset check counter
    await supabase
      .from("plots")
      .update({
        warning_level: "none",
        warning_reason: null,
        days_since_checked: 0,
        risk_score: 0.05,
        updated_at: new Date().toISOString(),
      })
      .eq("id", plot_id);

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("Clean inspection error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
