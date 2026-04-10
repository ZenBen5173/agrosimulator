import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST — confirm a scanned receipt and update inventory.
 * Farmer has reviewed and approved the extracted items.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { farm_id, scan_id, items } = body;

    if (!farm_id || !scan_id || !Array.isArray(items)) {
      return NextResponse.json({ error: "farm_id, scan_id, items required" }, { status: 400 });
    }

    const results = [];

    for (const item of items) {
      // Check if inventory item already exists
      const { data: existing } = await supabase
        .from("inventory_items")
        .select("id, current_quantity")
        .eq("farm_id", farm_id)
        .eq("item_name", item.item_name)
        .single();

      if (existing) {
        // Update existing item
        const newQty = (existing.current_quantity || 0) + item.quantity;
        await supabase
          .from("inventory_items")
          .update({
            current_quantity: newQty,
            last_purchase_price_rm: item.price_rm / item.quantity,
            supplier_name: item.supplier_name || null,
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id);

        // Record movement
        await supabase.from("inventory_movements").insert({
          farm_id,
          item_id: existing.id,
          movement_type: "purchase",
          quantity: item.quantity,
          unit: item.unit,
          notes: `Receipt scan #${scan_id}`,
        });

        results.push({ item_name: item.item_name, action: "updated", new_quantity: newQty });
      } else {
        // Create new item
        const { data: newItem } = await supabase
          .from("inventory_items")
          .insert({
            farm_id,
            item_name: item.item_name,
            item_type: item.item_type,
            current_quantity: item.quantity,
            unit: item.unit,
            last_purchase_price_rm: item.price_rm / item.quantity,
            supplier_name: item.supplier_name || null,
          })
          .select()
          .single();

        if (newItem) {
          await supabase.from("inventory_movements").insert({
            farm_id,
            item_id: newItem.id,
            movement_type: "purchase",
            quantity: item.quantity,
            unit: item.unit,
            notes: `Receipt scan #${scan_id}`,
          });
        }

        results.push({ item_name: item.item_name, action: "created", new_quantity: item.quantity });
      }
    }

    // Mark scan as confirmed
    await supabase
      .from("receipt_scans")
      .update({ confirmed_at: new Date().toISOString() })
      .eq("id", scan_id);

    return NextResponse.json({ results });
  } catch (err) {
    console.error("Confirm receipt error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
