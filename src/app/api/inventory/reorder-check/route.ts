import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { inventoryReorderFlow } from "@/flows/inventoryReorder";

/** POST — check inventory levels and generate reorder recommendations */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { farm_id } = await request.json();
    if (!farm_id) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const result = await inventoryReorderFlow({ farmId: farm_id });

    // Create purchase requests for urgent items
    for (const item of result.reorder_items.filter((i) => i.urgency === "immediate")) {
      await supabase.from("purchase_requests").insert({
        farm_id,
        item_name: item.item_name,
        quantity: item.recommended_order_quantity,
        unit: item.unit,
        estimated_cost_rm: item.estimated_cost_rm,
        supplier_name: item.supplier_name,
        status: "pending",
      });
    }

    return NextResponse.json(result);
  } catch (err) {
    console.error("Reorder check error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
