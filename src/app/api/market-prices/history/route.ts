import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Generates deterministic-ish historical price data using a seeded random walk.
 * Since we only store current snapshots, we simulate 90 days of history
 * working backwards from the current price using realistic volatility patterns.
 */

interface MarketItem {
  item_name: string;
  item_type: "crop" | "fertilizer" | "pesticide";
  base_price: number;
  unit: string;
  /** Daily volatility as a fraction (e.g. 0.02 = 2% daily swing) */
  volatility: number;
  /** Seasonal bias — positive means prices tend to rise this season */
  seasonalBias: number;
}

const MARKET_ITEMS: MarketItem[] = [
  // Crops — higher volatility
  { item_name: "Paddy/Rice", item_type: "crop", base_price: 1.2, unit: "kg", volatility: 0.012, seasonalBias: 0.001 },
  { item_name: "Oil Palm (FFB)", item_type: "crop", base_price: 0.85, unit: "kg", volatility: 0.018, seasonalBias: -0.001 },
  { item_name: "Rubber", item_type: "crop", base_price: 5.5, unit: "kg", volatility: 0.015, seasonalBias: 0.0005 },
  { item_name: "Chilli", item_type: "crop", base_price: 12.0, unit: "kg", volatility: 0.035, seasonalBias: 0.002 },
  { item_name: "Tomato", item_type: "crop", base_price: 4.5, unit: "kg", volatility: 0.025, seasonalBias: -0.001 },
  { item_name: "Cucumber", item_type: "crop", base_price: 2.8, unit: "kg", volatility: 0.02, seasonalBias: 0.0 },
  { item_name: "Kangkung", item_type: "crop", base_price: 3.5, unit: "kg", volatility: 0.018, seasonalBias: 0.001 },
  { item_name: "Durian", item_type: "crop", base_price: 35.0, unit: "kg", volatility: 0.04, seasonalBias: 0.003 },
  { item_name: "Banana", item_type: "crop", base_price: 3.2, unit: "kg", volatility: 0.015, seasonalBias: 0.0 },
  // Fertilizers — lower volatility
  { item_name: "NPK Fertilizer", item_type: "fertilizer", base_price: 2.8, unit: "kg", volatility: 0.008, seasonalBias: 0.0005 },
  { item_name: "Urea", item_type: "fertilizer", base_price: 2.2, unit: "kg", volatility: 0.007, seasonalBias: 0.0 },
  // Pesticides — low volatility
  { item_name: "Glyphosate", item_type: "pesticide", base_price: 25.0, unit: "liter", volatility: 0.006, seasonalBias: 0.0 },
  { item_name: "Cypermethrin", item_type: "pesticide", base_price: 35.0, unit: "liter", volatility: 0.005, seasonalBias: -0.0003 },
];

/** Simple seeded pseudo-random number generator (mulberry32) */
function seededRandom(seed: number) {
  let t = seed + 0x6d2b79f5;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function generateHistory(
  item: MarketItem,
  currentPrice: number,
  days: number
): { date: string; price: number; high: number; low: number }[] {
  const points: { date: string; price: number; high: number; low: number }[] = [];
  const today = new Date();

  // Work backwards from current price using reverse random walk
  // Use item name as seed for deterministic results per item
  let seed = 0;
  for (let i = 0; i < item.item_name.length; i++) {
    seed = ((seed << 5) - seed + item.item_name.charCodeAt(i)) | 0;
  }

  // Generate forward from a starting price, then scale to match current
  const rawPrices: number[] = [];
  let price = item.base_price * 0.95; // Start slightly below base

  for (let d = 0; d < days; d++) {
    seed++;
    const r = seededRandom(Math.abs(seed * 31 + d * 7));
    const change = (r - 0.5) * 2 * item.volatility + item.seasonalBias;
    price *= 1 + change;
    // Clamp to reasonable range (50% to 200% of base)
    price = Math.max(item.base_price * 0.5, Math.min(item.base_price * 2.0, price));
    rawPrices.push(price);
  }

  // Scale so the last point matches current price
  const lastRaw = rawPrices[rawPrices.length - 1];
  const scale = currentPrice / lastRaw;

  for (let d = 0; d < days; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - (days - 1 - d));
    const scaledPrice = rawPrices[d] * scale;

    // Generate intraday high/low
    seed++;
    const spreadR = seededRandom(Math.abs(seed * 13 + d * 3));
    const spread = item.volatility * (0.5 + spreadR) * scaledPrice;

    points.push({
      date: date.toISOString().split("T")[0],
      price: Math.round(scaledPrice * 100) / 100,
      high: Math.round((scaledPrice + spread) * 100) / 100,
      low: Math.round((scaledPrice - spread) * 100) / 100,
    });
  }

  return points;
}

export async function GET(req: NextRequest) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const itemName = searchParams.get("item");
    const daysParam = searchParams.get("days");
    const days = Math.min(90, Math.max(7, parseInt(daysParam || "30", 10)));

    // Fetch current prices from DB
    const { data: prices } = await supabase
      .from("market_prices")
      .select("item_name, item_type, price_per_kg, unit, trend, trend_pct, updated_at")
      .order("item_type")
      .order("item_name");

    if (!prices || prices.length === 0) {
      return NextResponse.json({ history: {} });
    }

    // If specific item requested, only generate for that item
    const targetItems = itemName
      ? MARKET_ITEMS.filter((m) => m.item_name === itemName)
      : MARKET_ITEMS;

    const history: Record<
      string,
      {
        item_name: string;
        item_type: string;
        unit: string;
        current_price: number;
        trend: string;
        trend_pct: number;
        data: { date: string; price: number; high: number; low: number }[];
      }
    > = {};

    for (const item of targetItems) {
      const dbPrice = prices.find((p) => p.item_name === item.item_name);
      const currentPrice = dbPrice?.price_per_kg ?? item.base_price;

      history[item.item_name] = {
        item_name: item.item_name,
        item_type: item.item_type,
        unit: item.unit,
        current_price: currentPrice,
        trend: dbPrice?.trend ?? "stable",
        trend_pct: dbPrice?.trend_pct ?? 0,
        data: generateHistory(item, currentPrice, days),
      };
    }

    return NextResponse.json({ history, days });
  } catch (err) {
    console.error("Market history error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
