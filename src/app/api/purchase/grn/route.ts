import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextDocNumber, transferItems, getDocumentItems, updateInventoryStock } from "@/lib/business";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, po_id, supplier_id, received_by, notes } = await request.json();
  if (!farm_id || !po_id) return NextResponse.json({ error: "farm_id, po_id required" }, { status: 400 });

  const grnNumber = await getNextDocNumber(farm_id, "GRN", "goods_received_notes");
  const { data: grn, error } = await supabase.from("goods_received_notes").insert({
    farm_id, po_id, supplier_id, grn_number: grnNumber, received_by, notes,
  }).select().single();
  if (error || !grn) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  // Transfer items from PO
  const total = await transferItems(po_id, "purchase_order", grn.id, "grn");
  await supabase.from("goods_received_notes").update({ total_rm: total }).eq("id", grn.id);

  // Update PO status
  await supabase.from("purchase_orders").update({ status: "received" }).eq("id", po_id);

  // Increase inventory stock
  const items = await getDocumentItems(grn.id, "grn");
  await updateInventoryStock(
    farm_id,
    items.map((i) => ({ item_name: i.item_name, quantity: i.quantity, unit: i.unit, unit_price_rm: i.unit_price_rm })),
    "increase",
    `GRN ${grnNumber}`
  );

  return NextResponse.json({ ...grn, total_rm: total, items });
}
