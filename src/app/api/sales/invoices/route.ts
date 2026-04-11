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

  const { data } = await supabase.from("sales_invoices").select("*, customers(name, phone)").eq("farm_id", farmId).order("created_at", { ascending: false });
  return NextResponse.json(data || []);
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, customer_id, so_id, do_id, due_date } = await request.json();
  if (!farm_id) return NextResponse.json({ error: "farm_id required" }, { status: 400 });

  const invNumber = await getNextDocNumber(farm_id, "INV", "sales_invoices");
  const dueDate = due_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];

  const { data: inv, error } = await supabase.from("sales_invoices").insert({
    farm_id, customer_id, so_id, do_id, inv_number: invNumber, due_date: dueDate,
  }).select().single();
  if (error || !inv) return NextResponse.json({ error: error?.message || "Failed" }, { status: 500 });

  // Transfer items from DO or SO (no stock change — already handled by DO)
  let total = 0;
  if (do_id) total = await transferItems(do_id, "delivery_order", inv.id, "sales_invoice");
  else if (so_id) total = await transferItems(so_id, "sales_order", inv.id, "sales_invoice");

  await supabase.from("sales_invoices").update({ total_rm: total }).eq("id", inv.id);

  // Create financial record (income receivable)
  await supabase.from("financial_records").insert({
    farm_id, record_type: "income", category: "Sales", amount: total,
    description: `Invoice ${invNumber}`, record_date: new Date().toISOString().split("T")[0],
  });

  // Update customer outstanding
  if (customer_id) {
    const { data: cust } = await supabase.from("customers").select("total_outstanding_rm").eq("id", customer_id).single();
    if (cust) {
      await supabase.from("customers").update({ total_outstanding_rm: (cust.total_outstanding_rm || 0) + total }).eq("id", customer_id);
    }
  }

  const items = await getDocumentItems(inv.id, "sales_invoice");
  return NextResponse.json({ ...inv, total_rm: total, items });
}
