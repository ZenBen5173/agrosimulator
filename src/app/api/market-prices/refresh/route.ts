import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface MarketItem {
  item_name: string;
  item_type: "crop" | "fertilizer" | "pesticide";
  base_price: number;
  unit: string;
}

const MARKET_ITEMS: MarketItem[] = [
  // Crops
  { item_name: "Paddy/Rice", item_type: "crop", base_price: 1.2, unit: "kg" },
  {
    item_name: "Oil Palm (FFB)",
    item_type: "crop",
    base_price: 0.85,
    unit: "kg",
  },
  { item_name: "Rubber", item_type: "crop", base_price: 5.5, unit: "kg" },
  { item_name: "Chilli", item_type: "crop", base_price: 12.0, unit: "kg" },
  { item_name: "Tomato", item_type: "crop", base_price: 4.5, unit: "kg" },
  { item_name: "Cucumber", item_type: "crop", base_price: 2.8, unit: "kg" },
  { item_name: "Kangkung", item_type: "crop", base_price: 3.5, unit: "kg" },
  { item_name: "Durian", item_type: "crop", base_price: 35.0, unit: "kg" },
  { item_name: "Banana", item_type: "crop", base_price: 3.2, unit: "kg" },
  // Fertilizers
  {
    item_name: "NPK Fertilizer",
    item_type: "fertilizer",
    base_price: 2.8,
    unit: "kg",
  },
  { item_name: "Urea", item_type: "fertilizer", base_price: 2.2, unit: "kg" },
  // Pesticides
  {
    item_name: "Glyphosate",
    item_type: "pesticide",
    base_price: 25.0,
    unit: "liter",
  },
  {
    item_name: "Cypermethrin",
    item_type: "pesticide",
    base_price: 35.0,
    unit: "liter",
  },
];

export async function POST() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const now = new Date().toISOString();

    const rows = MARKET_ITEMS.map((item) => {
      // Random variation between -15% and +15%
      const variationPct = (Math.random() * 30 - 15);
      const price = item.base_price * (1 + variationPct / 100);
      const roundedPrice = Math.round(price * 100) / 100;
      const roundedPct = Math.round(Math.abs(variationPct) * 10) / 10;

      let trend: "up" | "down" | "stable";
      if (variationPct > 5) {
        trend = "up";
      } else if (variationPct < -5) {
        trend = "down";
      } else {
        trend = "stable";
      }

      return {
        item_name: item.item_name,
        item_type: item.item_type,
        price_per_kg: roundedPrice,
        unit: item.unit,
        trend,
        trend_pct: trend === "stable" ? 0 : roundedPct,
        source: "simulated",
        updated_at: now,
      };
    });

    const { error } = await supabase
      .from("market_prices")
      .upsert(rows, { onConflict: "item_name" });

    if (error) {
      console.error("Failed to upsert market prices:", error);
      return NextResponse.json(
        { error: "Failed to refresh prices" },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, count: rows.length });
  } catch (err) {
    console.error("Market price refresh error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
