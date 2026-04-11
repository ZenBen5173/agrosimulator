import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextDocNumber, transferItems, getDocumentItems, updateInventoryStock } from "@/lib/business";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, customer_id, so_id } = await request.json();
  if (!farm_id || !so_id) return NextResponse.json({ error: "farm_id, so_id required" }, { status: 400 });

  const doNumber = await getNextDocNumber(farm_id, "DO", "delivery_orders");
  const { data: deliveryOrder, error } = await supabase.from("delivery_orders").insert({
    farm_id, customer_id, so_id, do_number: doNumber, status: "delivered",
  }).select().single();
  if (error || !deliveryOrder) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  // Transfer items from SO
  const total = await transferItems(so_id, "sales_order", deliveryOrder.id, "delivery_order");
  await supabase.from("delivery_orders").update({ total_rm: total }).eq("id", deliveryOrder.id);

  // Update SO status
  await supabase.from("sales_orders").update({ status: "fulfilled" }).eq("id", so_id);

  // Decrease inventory stock
  const items = await getDocumentItems(deliveryOrder.id, "delivery_order");
  await updateInventoryStock(
    farm_id,
    items.map((i) => ({ item_name: i.item_name, quantity: i.quantity, unit: i.unit, unit_price_rm: i.unit_price_rm })),
    "decrease",
    `DO ${doNumber}`
  );

  return NextResponse.json({ ...deliveryOrder, total_rm: total, items });
}
