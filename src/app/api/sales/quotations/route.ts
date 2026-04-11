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

  const { data } = await supabase.from("sales_quotations").select("*, customers(name, phone)").eq("farm_id", farmId).order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, customer_id, items, valid_until, status } = await request.json();
  if (!farm_id || !items?.length) return NextResponse.json({ error: "farm_id, items required" }, { status: 400 });

  const qtNumber = await getNextDocNumber(farm_id, "QT", "sales_quotations");
  const validDate = valid_until || new Date(Date.now() + 14 * 86400000).toISOString().split("T")[0];

  const { data: qt, error } = await supabase.from("sales_quotations").insert({
    farm_id, customer_id, qt_number: qtNumber, valid_until: validDate, status: status || "draft",
  }).select().single();
  if (error || !qt) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  const total = await insertDocumentItems(qt.id, "quotation", items);
  await supabase.from("sales_quotations").update({ total_rm: total }).eq("id", qt.id);

  const docItems = await getDocumentItems(qt.id, "quotation");
  return NextResponse.json({ ...qt, total_rm: total, items: docItems });
}
