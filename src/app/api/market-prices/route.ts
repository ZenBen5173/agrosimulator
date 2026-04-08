import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data, error } = await supabase
      .from("market_prices")
      .select(
        "item_name, item_type, price_per_kg, unit, trend, trend_pct, updated_at"
      )
      .order("item_type")
      .order("item_name");

    if (error) {
      console.error("Failed to fetch market prices:", error);
      return NextResponse.json(
        { error: "Failed to fetch prices" },
        { status: 500 }
      );
    }

    return NextResponse.json({ prices: data || [] });
  } catch (err) {
    console.error("Market prices error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
