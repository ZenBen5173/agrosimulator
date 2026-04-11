import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextDocNumber, insertDocumentItems, transferItems, getDocumentItems } from "@/lib/business";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const farmId = url.searchParams.get("farm_id");
  if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("purchase_orders").select("*, suppliers(name, phone)").eq("farm_id", farmId).order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, supplier_id, rq_id, items, status } = await request.json();
  if (!farm_id) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const poNumber = await getNextDocNumber(farm_id, "PO", "purchase_orders");
  const { data: po, error } = await supabase.from("purchase_orders").insert({
    farm_id, supplier_id, rq_id: rq_id || null, po_number: poNumber, status: status || "confirmed",
  }).select().single();
  if (error || !po) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  let total = 0;
  if (rq_id) {
    total = await transferItems(rq_id, "rfq", po.id, "purchase_order");
    await supabase.from("purchase_rfqs").update({ status: "converted" }).eq("id", rq_id);
  } else if (items?.length) {
    total = await insertDocumentItems(po.id, "purchase_order", items);
  }

  await supabase.from("purchase_orders").update({ total_rm: total }).eq("id", po.id);
  const docItems = await getDocumentItems(po.id, "purchase_order");
  return NextResponse.json({ ...po, total_rm: total, items: docItems });
}
