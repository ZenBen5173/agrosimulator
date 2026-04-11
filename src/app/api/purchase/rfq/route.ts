import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextDocNumber, insertDocumentItems, getDocumentItems } from "@/lib/business";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const farmId = url.searchParams.get("farm_id");
  if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("purchase_rfqs").select("*, suppliers(name, phone)").eq("farm_id", farmId).order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, supplier_id, items, notes, status } = await request.json();
  if (!farm_id || !items?.length) return NextResponse.json({ error: "farm_id, items required" }, { status: 400 });

  const rfqNumber = await getNextDocNumber(farm_id, "RFQ", "purchase_rfqs");
  const { data: rfq, error } = await supabase.from("purchase_rfqs").insert({
    farm_id, supplier_id: supplier_id || null, rfq_number: rfqNumber, status: status || "draft", notes,
  }).select().single();
  if (error || !rfq) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  const total = await insertDocumentItems(rfq.id, "rfq", items);
  await supabase.from("purchase_rfqs").update({ total_rm: total }).eq("id", rfq.id);

  const docItems = await getDocumentItems(rfq.id, "rfq");
  return NextResponse.json({ ...rfq, total_rm: total, items: docItems });
}
