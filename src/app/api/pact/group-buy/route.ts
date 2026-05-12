/**
 * AgroSim 2.0 — Pact: Group buy endpoint.
 *
 * GET  /api/pact/group-buy?district=Cameron%20Highlands
 *      → list open group buys in the district
 *
 * POST /api/pact/group-buy
 *      → create a new group buy (initiator = authed user)
 *      Body: CreateGroupBuyInput (without initiatorUserId)
 */

import { NextResponse } from "next/server";
import {
  createGroupBuy,
  listOpenGroupBuysInDistrict,
} from "@/services/pact/groupBuyService";
import { createClient } from "@/lib/supabase/server";
import type { CreateGroupBuyInput } from "@/lib/pact/groupBuy";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const district = url.searchParams.get("district");
  if (!district) {
    return NextResponse.json({ error: "district required" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    const list = await listOpenGroupBuysInDistrict(
      supabase,
      district,
      user?.id ?? null
    );
    return NextResponse.json({ groupBuys: list });
  } catch (err) {
    console.error("List group buys error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}

interface CreatePayload {
  initiatorFarmId: string;
  district: string;
  itemName: string;
  itemCategory?: string;
  unit: string;
  individualPriceRm: number;
  bulkPriceRm: number;
  minParticipants: number;
  maxParticipants?: number;
  closesAt: string;
  supplierName?: string;
}

export async function POST(request: Request) {
  let body: CreatePayload;
  try {
    body = (await request.json()) as CreatePayload;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const input: CreateGroupBuyInput = {
      initiatorUserId: user.id,
      ...body,
    };

    const result = await createGroupBuy(supabase, input);
    if ("errors" in result) {
      return NextResponse.json({ errors: result.errors }, { status: 400 });
    }
    return NextResponse.json({ id: result.id }, { status: 201 });
  } catch (err) {
    console.error("Create group buy error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
