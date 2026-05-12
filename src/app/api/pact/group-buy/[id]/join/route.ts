/**
 * POST /api/pact/group-buy/:id/join
 * Body: { farmId: string, quantityCommitted: number }
 */

import { NextResponse } from "next/server";
import { joinGroupBuy } from "@/services/pact/groupBuyService";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;

  let body: { farmId?: string; quantityCommitted?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body.farmId || typeof body.quantityCommitted !== "number") {
    return NextResponse.json(
      { error: "farmId and quantityCommitted required" },
      { status: 400 }
    );
  }

  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await joinGroupBuy(supabase, {
      groupBuyId: id,
      userId: user.id,
      farmId: body.farmId,
      quantityCommitted: body.quantityCommitted,
    });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    return NextResponse.json(result);
  } catch (err) {
    console.error("Join group buy error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Unknown" },
      { status: 500 }
    );
  }
}
