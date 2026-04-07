import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { researchFarm } from "@/services/ai/gemini";

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
    return NextResponse.json({ error: "farm_id is required" }, { status: 400 });
  }

  // Fetch farm (RLS ensures user can only access their own)
  const { data: farm, error: farmError } = await supabase
    .from("farms")
    .select("bounding_box, area_acres")
    .eq("id", farm_id)
    .single();

  if (farmError || !farm) {
    return NextResponse.json({ error: "Farm not found" }, { status: 404 });
  }

  // Call Gemini
  const result = await researchFarm(farm.bounding_box, farm.area_acres);

  // Save to onboarding_ai_suggestions (delete existing first to handle re-runs)
  await supabase
    .from("onboarding_ai_suggestions")
    .delete()
    .eq("farm_id", farm_id);

  await supabase.from("onboarding_ai_suggestions").insert({
    farm_id,
    suggested_soil: result.suggested_soil,
    soil_reasoning: result.soil_reasoning,
    suggested_water: result.suggested_water,
    water_reasoning: result.water_reasoning,
    plot_layout_json: {
      soil_confidence: result.soil_confidence,
      nearby_irrigation_scheme: result.nearby_irrigation_scheme,
    },
  });

  // Backfill district and state on the farm
  if (result.district || result.state) {
    await supabase
      .from("farms")
      .update({
        district: result.district,
        state: result.state,
      })
      .eq("id", farm_id);
  }

  return NextResponse.json(result);
  } catch (err) {
    console.error("research-farm error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal error" },
      { status: 500 }
    );
  }
}
