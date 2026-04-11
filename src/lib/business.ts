import { createClient } from "@/lib/supabase/server";

/**
 * Generate next auto-number for a document type.
 * Format: PREFIX-0001, PREFIX-0002, etc.
 */
export async function getNextDocNumber(farmId: string, prefix: string, table: string): Promise<string> {
  const supabase = await createClient();
  const { count } = await supabase
    .from(table)
    .select("id", { count: "exact", head: true })
    .eq("farm_id", farmId);
  return `${prefix}-${String((count || 0) + 1).padStart(4, "0")}`;
}

/**
 * Insert line items for a document and calculate total.
 */
export async function insertDocumentItems(
  documentId: string,
  documentType: string,
  items: { item_name: string; description?: string; quantity: number; unit: string; unit_price_rm: number; inventory_item_id?: string }[]
): Promise<number> {
  const supabase = await createClient();
  const rows = items.map((item) => ({
    document_id: documentId,
    document_type: documentType,
    item_name: item.item_name,
    description: item.description || null,
    quantity: item.quantity,
    unit: item.unit,
    unit_price_rm: item.unit_price_rm,
    inventory_item_id: item.inventory_item_id || null,
  }));

  await supabase.from("document_items").insert(rows);

  const total = items.reduce((sum, i) => sum + i.quantity * i.unit_price_rm, 0);
  return Math.round(total * 100) / 100;
}

/**
 * Get line items for a document.
 */
export async function getDocumentItems(documentId: string, documentType: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("document_items")
    .select("*")
    .eq("document_id", documentId)
    .eq("document_type", documentType)
    .order("created_at");
  return data || [];
}

/**
 * Copy items from one document to another (for document transfer chain).
 */
export async function transferItems(
  sourceId: string,
  sourceType: string,
  targetId: string,
  targetType: string
): Promise<number> {
  const items = await getDocumentItems(sourceId, sourceType);
  if (items.length === 0) return 0;

  const supabase = await createClient();
  const rows = items.map((i) => ({
    document_id: targetId,
    document_type: targetType,
    item_name: i.item_name,
    description: i.description,
    quantity: i.quantity,
    unit: i.unit,
    unit_price_rm: i.unit_price_rm,
    inventory_item_id: i.inventory_item_id,
  }));

  await supabase.from("document_items").insert(rows);
  return items.reduce((sum, i) => sum + i.quantity * i.unit_price_rm, 0);
}

/**
 * Update inventory stock (increase or decrease).
 */
export async function updateInventoryStock(
  farmId: string,
  items: { item_name: string; quantity: number; unit: string; unit_price_rm: number }[],
  direction: "increase" | "decrease",
  reason: string
) {
  const supabase = await createClient();

  for (const item of items) {
    const { data: inv } = await supabase
      .from("inventory_items")
      .select("id, current_quantity")
      .eq("farm_id", farmId)
      .ilike("item_name", `%${item.item_name.split(" ")[0]}%`)
      .limit(1)
      .single();

    if (inv) {
      const newQty = direction === "increase"
        ? inv.current_quantity + item.quantity
        : Math.max(0, inv.current_quantity - item.quantity);

      await supabase
        .from("inventory_items")
        .update({
          current_quantity: newQty,
          ...(direction === "increase" ? { last_purchase_price_rm: item.unit_price_rm } : {}),
          updated_at: new Date().toISOString(),
        })
        .eq("id", inv.id);

      await supabase.from("inventory_movements").insert({
        farm_id: farmId,
        item_id: inv.id,
        movement_type: direction === "increase" ? "purchase" : "usage",
        quantity: item.quantity,
        unit: item.unit,
        notes: reason,
      });
    }
  }
}
