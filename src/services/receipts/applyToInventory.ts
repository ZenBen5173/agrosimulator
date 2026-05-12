/**
 * Apply a confirmed parsed receipt to the user's inventory + accounting.
 *
 * Idempotency note: this currently does not deduplicate against past
 * inventory_movements. A future iteration could hash the receipt photo to
 * prevent double-apply if the user taps Confirm twice.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ItemCategory, ParsedReceipt } from "@/lib/receipts/types";

/**
 * Map our parser's rich category to the legacy `inventory_items.item_type`
 * enum (fertilizer | pesticide | seed | tool | other).
 */
function mapCategory(cat: ItemCategory): "fertilizer" | "pesticide" | "seed" | "tool" | "other" {
  switch (cat) {
    case "fertiliser":
      return "fertilizer";
    case "fungicide":
    case "insecticide":
    case "herbicide":
      return "pesticide";
    case "seed":
      return "seed";
    case "tool_equipment":
      return "tool";
    case "fuel":
    case "service":
    case "other":
    default:
      return "other";
  }
}

export interface ApplyReceiptResult {
  itemsAdded: number;
  itemsUpdated: number;
  totalRm: number;
  inventoryUpdates: {
    itemName: string;
    quantityAdded: number;
    unit: string;
    newBalance: number;
  }[];
}

export async function applyParsedReceipt(
  supabase: SupabaseClient,
  args: { receipt: ParsedReceipt; farmId: string }
): Promise<ApplyReceiptResult> {
  const { receipt, farmId } = args;

  let itemsAdded = 0;
  let itemsUpdated = 0;
  const inventoryUpdates: ApplyReceiptResult["inventoryUpdates"] = [];

  for (const line of receipt.items) {
    if (line.totalRm <= 0 || line.quantity <= 0) continue;

    // Find existing inventory item by case-insensitive name + same unit
    const { data: existing } = await supabase
      .from("inventory_items")
      .select("id, current_quantity")
      .eq("farm_id", farmId)
      .ilike("item_name", line.itemName)
      .eq("unit", line.unit)
      .maybeSingle();

    let itemId: string;
    let newBalance: number;

    if (existing) {
      newBalance =
        Number(existing.current_quantity) + Number(line.quantity);
      const { error } = await supabase
        .from("inventory_items")
        .update({
          current_quantity: newBalance,
          last_purchase_price_rm: line.unitPriceRm ?? null,
          supplier_name: receipt.supplierName ?? null,
        })
        .eq("id", existing.id);
      if (error) throw new Error(`update inventory: ${error.message}`);
      itemId = existing.id;
      itemsUpdated++;
    } else {
      const { data: inserted, error } = await supabase
        .from("inventory_items")
        .insert({
          farm_id: farmId,
          item_name: line.itemName,
          item_type: mapCategory(line.category),
          current_quantity: line.quantity,
          unit: line.unit,
          last_purchase_price_rm: line.unitPriceRm ?? null,
          supplier_name: receipt.supplierName ?? null,
        })
        .select("id")
        .single();
      if (error || !inserted) throw new Error(`insert inventory: ${error?.message}`);
      itemId = inserted.id;
      newBalance = line.quantity;
      itemsAdded++;
    }

    // Log the movement
    const { error: mvErr } = await supabase.from("inventory_movements").insert({
      farm_id: farmId,
      item_id: itemId,
      movement_type: "purchase",
      quantity: line.quantity,
      unit: line.unit,
      notes: `Receipt scan: ${receipt.supplierName ?? "unknown supplier"}${
        receipt.receiptDate ? ` on ${receipt.receiptDate}` : ""
      }`,
    });
    if (mvErr) throw new Error(`insert movement: ${mvErr.message}`);

    inventoryUpdates.push({
      itemName: line.itemName,
      quantityAdded: line.quantity,
      unit: line.unit,
      newBalance,
    });
  }

  return {
    itemsAdded,
    itemsUpdated,
    totalRm: receipt.totalAmountRm,
    inventoryUpdates,
  };
}
