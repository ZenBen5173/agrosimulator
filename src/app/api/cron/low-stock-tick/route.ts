/**
 * AgroSim 2.1 — Auto low-stock cron tick.
 *
 * Hit on a schedule (Vercel Cron / Cloud Scheduler / pg_cron). Finds
 * every inventory item that's at or below its reorder threshold AND
 * doesn't already have an open restock_request, then auto-opens one
 * with triggerKind='auto_low_stock'. The farmer sees the new chat in
 * /restock next time they open the app.
 *
 * AUTH: Bearer ${CRON_SECRET}.
 *
 * Recommended schedule: every 6 hours.
 */

import { NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createRestockRequest } from "@/services/restock/service";

interface InventoryRow {
  id: string;
  farm_id: string;
  item_name: string;
  current_quantity: number | string;
  reorder_threshold: number | string | null;
}

interface FarmRow {
  id: string;
  user_id: string;
}

export async function POST(request: Request) {
  const expected = process.env.CRON_SECRET;
  if (!expected) {
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 503 }
    );
  }
  const auth = request.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceKey) {
    return NextResponse.json(
      { error: "SUPABASE_SERVICE_ROLE_KEY not configured" },
      { status: 503 }
    );
  }

  const supabase = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceKey,
    { auth: { persistSession: false } }
  );

  // 1. Pull every item below threshold
  const { data: lowItems, error } = await supabase
    .from("inventory_items")
    .select("id, farm_id, item_name, current_quantity, reorder_threshold")
    .not("reorder_threshold", "is", null);
  if (error) {
    return NextResponse.json(
      { error: "Inventory query failed", message: error.message },
      { status: 500 }
    );
  }

  const candidates = (lowItems ?? []).filter(
    (it) =>
      it.reorder_threshold != null &&
      Number(it.current_quantity) <= Number(it.reorder_threshold)
  ) as InventoryRow[];

  if (candidates.length === 0) {
    return NextResponse.json({
      tickedAt: new Date().toISOString(),
      checked: lowItems?.length ?? 0,
      opened: 0,
      processed: [],
    });
  }

  // 2. For each, dedupe against any open chats, then create the restock
  const processed: Array<{
    inventoryItemId: string;
    farmId: string;
    opened: boolean;
    skippedReason?: string;
    error?: string;
  }> = [];

  // Pull the corresponding farms in one query for user_id
  const farmIds = Array.from(new Set(candidates.map((c) => c.farm_id)));
  const { data: farms } = await supabase
    .from("farms")
    .select("id, user_id")
    .in("id", farmIds);
  const farmById = new Map<string, FarmRow>(
    (farms ?? []).map((f) => [f.id, f as FarmRow])
  );

  // Pull existing open restocks across these farms
  const { data: existing } = await supabase
    .from("restock_requests")
    .select("inventory_item_id, farm_id, status")
    .in("farm_id", farmIds)
    .not("status", "in", "(closed,cancelled)");
  const openSet = new Set(
    (existing ?? []).map((r) => `${r.farm_id}:${r.inventory_item_id}`)
  );

  for (const item of candidates) {
    const farm = farmById.get(item.farm_id);
    if (!farm) {
      processed.push({
        inventoryItemId: item.id,
        farmId: item.farm_id,
        opened: false,
        skippedReason: "Farm not found",
      });
      continue;
    }
    const key = `${item.farm_id}:${item.id}`;
    if (openSet.has(key)) {
      processed.push({
        inventoryItemId: item.id,
        farmId: item.farm_id,
        opened: false,
        skippedReason: "Open restock already exists",
      });
      continue;
    }
    try {
      await createRestockRequest(supabase, {
        farmId: item.farm_id,
        userId: farm.user_id,
        inventoryItemId: item.id,
        triggerKind: "auto_low_stock",
      });
      processed.push({
        inventoryItemId: item.id,
        farmId: item.farm_id,
        opened: true,
      });
    } catch (err) {
      processed.push({
        inventoryItemId: item.id,
        farmId: item.farm_id,
        opened: false,
        error: err instanceof Error ? err.message : "Unknown",
      });
    }
  }

  return NextResponse.json({
    tickedAt: new Date().toISOString(),
    checked: candidates.length,
    opened: processed.filter((p) => p.opened).length,
    processed,
  });
}
