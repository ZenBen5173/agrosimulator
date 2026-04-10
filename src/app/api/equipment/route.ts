import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET — list equipment for a farm with depreciation calculations */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("equipment")
      .select("*")
      .eq("farm_id", farmId)
      .order("name");

    if (error) throw error;

    // Calculate depreciation for each item
    const now = new Date();
    const enriched = (data || []).map((eq) => {
      const purchaseDate = eq.purchase_date ? new Date(eq.purchase_date) : null;
      const purchasePrice = eq.purchase_price_rm || 0;
      const salvageValue = eq.salvage_value_rm || 0;
      const usefulLife = eq.useful_life_years || 5;

      let yearsOwned = 0;
      let annualDep = 0;
      let currentBookValue = purchasePrice;
      let monthlyDep = 0;

      if (purchaseDate && purchasePrice > 0) {
        yearsOwned = (now.getTime() - purchaseDate.getTime()) / (365.25 * 86400000);
        annualDep = (purchasePrice - salvageValue) / usefulLife;
        currentBookValue = Math.max(salvageValue, purchasePrice - annualDep * yearsOwned);
        monthlyDep = annualDep / 12;
      }

      // Service overdue if last serviced > 90 days ago
      const lastServiced = eq.last_serviced_date ? new Date(eq.last_serviced_date) : null;
      const serviceOverdue = lastServiced
        ? (now.getTime() - lastServiced.getTime()) / 86400000 > 90
        : false;

      return {
        ...eq,
        annual_depreciation_rm: Math.round(annualDep * 100) / 100,
        monthly_depreciation_rm: Math.round(monthlyDep * 100) / 100,
        current_book_value_rm: Math.round(currentBookValue * 100) / 100,
        years_owned: Math.round(yearsOwned * 10) / 10,
        service_overdue: serviceOverdue,
      };
    });

    return NextResponse.json(enriched);
  } catch (err) {
    console.error("Equipment GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST — add equipment */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { farm_id, name, category, purchase_date, purchase_price_rm, salvage_value_rm, useful_life_years, condition } = body;

    if (!farm_id || !name || !category) {
      return NextResponse.json({ error: "farm_id, name, category required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("equipment")
      .insert({
        farm_id,
        name,
        category,
        purchase_date,
        purchase_price_rm,
        salvage_value_rm: salvage_value_rm ?? 0,
        useful_life_years: useful_life_years ?? 5,
        current_book_value_rm: purchase_price_rm,
        condition: condition ?? "good",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("Equipment POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
