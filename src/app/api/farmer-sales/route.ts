/**
 * AgroSim 2.0 — Pact: Log a farmer sale.
 *
 * POST /api/farmer-sales
 * Body: { crop, district, saleDate, quantityKg, priceRmPerKg, buyerType?, buyerNote?, plotId? }
 *
 * Anonymous district aggregates are computed from this table by a separate
 * cron job (or a Postgres trigger) — consumers never see individual rows.
 */

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { CropName } from "@/lib/diagnosis/types";

const VALID_CROPS: CropName[] = [
  "paddy",
  "chilli",
  "kangkung",
  "banana",
  "corn",
  "sweet_potato",
];

const VALID_BUYER = [
  "middleman",
  "market_stall",
  "restaurant",
  "direct_consumer",
  "other",
];

interface Body {
  crop?: CropName;
  district?: string;
  saleDate?: string;
  quantityKg?: number;
  priceRmPerKg?: number;
  buyerType?: string;
  buyerNote?: string;
  plotId?: string;
}

export async function POST(request: Request) {
  let body: Body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.crop || !VALID_CROPS.includes(body.crop)) {
    return NextResponse.json(
      { error: "crop required and must be a known CropName" },
      { status: 400 }
    );
  }
  if (!body.district) {
    return NextResponse.json({ error: "district required" }, { status: 400 });
  }
  if (!body.saleDate) {
    return NextResponse.json({ error: "saleDate required" }, { status: 400 });
  }
  if (typeof body.quantityKg !== "number" || body.quantityKg <= 0) {
    return NextResponse.json({ error: "quantityKg must be > 0" }, { status: 400 });
  }
  if (typeof body.priceRmPerKg !== "number" || body.priceRmPerKg < 0) {
    return NextResponse.json({ error: "priceRmPerKg must be >= 0" }, { status: 400 });
  }
  if (body.buyerType && !VALID_BUYER.includes(body.buyerType)) {
    return NextResponse.json({ error: "buyerType invalid" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Resolve farm
    const { data: farm } = await supabase
      .from("farms")
      .select("id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (!farm) {
      return NextResponse.json(
        { error: "No farm found — create one in Onboarding" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("farmer_sales")
      .insert({
        farm_id: farm.id,
        user_id: user.id,
        plot_id: body.plotId ?? null,
        crop: body.crop,
        district: body.district,
        sale_date: body.saleDate,
        quantity_kg: body.quantityKg,
        price_rm_per_kg: body.priceRmPerKg,
        buyer_type: body.buyerType ?? null,
        buyer_note: body.buyerNote ?? null,
      })
      .select("id, total_rm")
      .single();
    if (error || !data) throw new Error(error?.message ?? "insert failed");

    return NextResponse.json({ id: data.id, totalRm: data.total_rm });
  } catch (err) {
    console.error("farmer-sales POST error:", err);
    return NextResponse.json(
      {
        error: "Failed to log sale",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
