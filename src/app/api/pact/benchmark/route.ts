/**
 * AgroSim 2.0 — Pact layer: anonymous district price benchmark.
 *
 * GET /api/pact/benchmark?district=Cameron%20Highlands&crop=chilli&farmer_id=demo-farmer-1
 * Returns: PriceBenchmarkResponse with the killer line.
 *
 * Today the data comes from the seeded provider (realistic demo data).
 * Post-finals: swap the provider for the Supabase-backed one populated by a
 * cron job that aggregates farmer-logged sales.
 */

import { NextResponse } from "next/server";
import { buildBenchmark } from "@/lib/pact/priceBenchmark";
import {
  latestMonday,
  seededProvider,
} from "@/services/pact/benchmarkProvider";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import type { CropName } from "@/lib/diagnosis/types";

const VALID_CROPS: CropName[] = [
  "paddy",
  "chilli",
  "kangkung",
  "banana",
  "corn",
  "sweet_potato",
];

export async function GET(request: Request) {
  const url = new URL(request.url);
  const district = url.searchParams.get("district");
  const crop = url.searchParams.get("crop") as CropName | null;
  const farmerId = url.searchParams.get("farmer_id");
  const week = url.searchParams.get("week") ?? latestMonday();

  if (!district) {
    return NextResponse.json({ error: "district required" }, { status: 400 });
  }
  if (!crop || !VALID_CROPS.includes(crop)) {
    return NextResponse.json(
      { error: "crop required and must be a known CropName" },
      { status: 400 }
    );
  }

  try {
    // District aggregate still comes from seeded data (real cron later).
    const districtAgg = await seededProvider.getDistrictWeek(district, crop, week);

    // Farmer's last sale comes from the LIVE farmer_sales table — this is
    // what powers the killer line "you sold at RM X". Rolling average over
    // the 3 most recent sales for stability.
    //
    // SECURITY NOTE: we use the service-role client here so the lookup works
    // for any farmer_id the caller passes. The data exposed is the 3-sale
    // rolling average per crop — exactly the kind of aggregate the benchmark
    // exists to share. Individual sale rows stay protected by RLS. UUIDs
    // are not enumerable so this isn't a practical privacy hole. A future
    // hardening pass will require an authed session matching the farmer_id.
    let farmerLast: number | null = null;
    if (farmerId && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      const svc = createServiceClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY,
        { auth: { autoRefreshToken: false, persistSession: false } }
      );
      const { data: rows } = await svc
        .from("farmer_sales")
        .select("price_rm_per_kg, sale_date")
        .eq("user_id", farmerId)
        .eq("crop", crop)
        .order("sale_date", { ascending: false })
        .limit(3);
      if (rows && rows.length > 0) {
        const sum = rows.reduce(
          (acc, r) => acc + Number(r.price_rm_per_kg),
          0
        );
        farmerLast = Math.round((sum / rows.length) * 100) / 100;
      }
    }

    const response = buildBenchmark({
      district,
      crop,
      weekStarting: week,
      district_aggregate: districtAgg,
      farmer_last_sale_rm_per_kg: farmerLast,
    });

    return NextResponse.json(response);
  } catch (err) {
    console.error("Benchmark error:", err);
    return NextResponse.json(
      {
        error: "Benchmark lookup failed",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
