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

  const { data } = await supabase.from("sales_orders").select("*, customers(name, phone)").eq("farm_id", farmId).order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, customer_id, quotation_id, items, status } = await request.json();
  if (!farm_id) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const soNumber = await getNextDocNumber(farm_id, "SO", "sales_orders");
  const { data: so, error } = await supabase.from("sales_orders").insert({
    farm_id, customer_id, quotation_id: quotation_id || null, so_number: soNumber, status: status || "confirmed",
  }).select().single();
  if (error || !so) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  let total = 0;
  if (quotation_id) {
    total = await transferItems(quotation_id, "quotation", so.id, "sales_order");
    await supabase.from("sales_quotations").update({ status: "converted" }).eq("id", quotation_id);
  } else if (items?.length) {
    total = await insertDocumentItems(so.id, "sales_order", items);
  }

  await supabase.from("sales_orders").update({ total_rm: total }).eq("id", so.id);
  const docItems = await getDocumentItems(so.id, "sales_order");
  return NextResponse.json({ ...so, total_rm: total, items: docItems });
}
