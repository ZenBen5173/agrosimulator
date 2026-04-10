import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** GET — list inventory items for a farm */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const farmId = url.searchParams.get("farm_id");
    if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data, error } = await supabase
      .from("inventory_items")
      .select("*")
      .eq("farm_id", farmId)
      .order("item_type")
      .order("item_name");

    if (error) throw error;
    return NextResponse.json(data || []);
  } catch (err) {
    console.error("Inventory GET error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

/** POST — add or update an inventory item */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { farm_id, item_name, item_type, current_quantity, unit, reorder_threshold, reorder_quantity, last_purchase_price_rm, supplier_name } = body;

    if (!farm_id || !item_name || !item_type) {
      return NextResponse.json({ error: "farm_id, item_name, item_type required" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("inventory_items")
      .upsert({
        farm_id,
        item_name,
        item_type,
        current_quantity: current_quantity ?? 0,
        unit: unit ?? "kg",
        reorder_threshold,
        reorder_quantity,
        last_purchase_price_rm,
        supplier_name,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: "id",
      })
      .select()
      .single();

    if (error) throw error;
    return NextResponse.json(data);
  } catch (err) {
    console.error("Inventory POST error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
