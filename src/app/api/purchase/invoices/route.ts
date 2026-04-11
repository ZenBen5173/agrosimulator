import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextDocNumber, transferItems, getDocumentItems } from "@/lib/business";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const farmId = url.searchParams.get("farm_id");
  if (!farmId) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await supabase.from("purchase_invoices").select("*, suppliers(name)").eq("farm_id", farmId).order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, supplier_id, po_id, grn_id, due_date } = await request.json();
  if (!farm_id) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const billNumber = await getNextDocNumber(farm_id, "BILL", "purchase_invoices");
  const dueDate = due_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  const { data: bill, error } = await supabase.from("purchase_invoices").insert({
    farm_id, supplier_id, po_id, grn_id, bill_number: billNumber, due_date: dueDate,
  }).select().single();
  if (error || !bill) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  // Transfer items from GRN or PO (no stock change — already handled by GRN)
  let total = 0;
  if (grn_id) total = await transferItems(grn_id, "grn", bill.id, "purchase_invoice");
  else if (po_id) total = await transferItems(po_id, "purchase_order", bill.id, "purchase_invoice");

  await supabase.from("purchase_invoices").update({ total_rm: total }).eq("id", bill.id);

  // Create financial record (expense)
  await supabase.from("financial_records").insert({
    farm_id, record_type: "expense", category: "Purchase", amount: total,
    description: `Bill ${billNumber}`, record_date: new Date().toISOString().split("T")[0],
  });

  const items = await getDocumentItems(bill.id, "purchase_invoice");
  return NextResponse.json({ ...bill, total_rm: total, items });
}
