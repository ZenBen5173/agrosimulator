/**
 * AgroSim 2.0 — Confirm a parsed receipt and write to inventory.
 *
 * POST /api/receipts/apply
 * Body: { receipt: ParsedReceipt, farmId?: string }
 *
 * Auth required. If farmId omitted, uses the user's first farm.
 */

import { NextResponse } from "next/server";
import { applyParsedReceipt } from "@/services/receipts/applyToInventory";
import { createClient } from "@/lib/supabase/server";
import type { ParsedReceipt } from "@/lib/receipts/types";

export async function POST(request: Request) {
  let body: { receipt?: ParsedReceipt; farmId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.receipt) {
    return NextResponse.json({ error: "receipt required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let resolvedFarmId: string;
    if (body.farmId) {
      resolvedFarmId = body.farmId;
    } else {
      const { data: farm } = await supabase
        .from("farms")
        .select("id")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (!farm) {
        return NextResponse.json(
          { error: "No farm found for user. Create one in Onboarding first." },
          { status: 400 }
        );
      }
      resolvedFarmId = farm.id;
    }

    const result = await applyParsedReceipt(supabase, {
      receipt: body.receipt,
      farmId: resolvedFarmId,
    });

    return NextResponse.json(result);
  } catch (err) {
    console.error("Apply receipt error:", err);
    return NextResponse.json(
      {
        error: "Failed to apply receipt",
        message: err instanceof Error ? err.message : "Unknown",
      },
      { status: 500 }
    );
  }
}
