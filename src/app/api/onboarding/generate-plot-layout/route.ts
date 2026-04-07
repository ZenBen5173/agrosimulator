import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { generatePlotLayout } from "@/services/ai/plotLayout";

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { farm_id } = await request.json();

    if (!farm_id) {
      return NextResponse.json(
        { error: "farm_id is required" },
        { status: 400 }
      );
    }

    // Fetch farm details (RLS ensures user can only access their own)
    const { data: farm, error: farmError } = await supabase
      .from("farms")
      .select(
        "grid_size, area_acres, soil_type, water_source, district, state"
      )
      .eq("id", farm_id)
      .single();

    if (farmError || !farm) {
      return NextResponse.json({ error: "Farm not found" }, { status: 404 });
    }

    // Call Gemini to generate plot layout
    const gridJson = await generatePlotLayout(
      farm.grid_size || 6,
      farm.area_acres || 1,
      farm.soil_type || "loam",
      farm.water_source || "rain_fed",
      farm.district || "Unknown",
      farm.state || "Unknown"
    );

    // Save to onboarding_ai_suggestions.plot_layout_json
    // Merge with existing data (soil_confidence etc.) if present
    const { data: existing } = await supabase
      .from("onboarding_ai_suggestions")
      .select("plot_layout_json")
      .eq("farm_id", farm_id)
      .single();

    const existingLayout =
      existing?.plot_layout_json &&
      typeof existing.plot_layout_json === "object"
        ? existing.plot_layout_json
        : {};

    await supabase
      .from("onboarding_ai_suggestions")
      .update({
        plot_layout_json: {
          ...existingLayout,
          ...gridJson,
        },
      })
      .eq("farm_id", farm_id);

    return NextResponse.json(gridJson);
  } catch (err) {
    console.error("generate-plot-layout error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
