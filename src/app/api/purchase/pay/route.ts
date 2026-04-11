import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, bill_id, amount_rm, payment_method, reference, notes } = await request.json();
  if (!farm_id || !bill_id || !amount_rm) return NextResponse.json({ error: "farm_id, bill_id, amount_rm required" }, { status: 400 });

  // Get current bill
  const { data: bill } = await supabase.from("purchase_invoices").select("*").eq("id", bill_id).single();
  if (!bill) return NextResponse.json({ error: "Bill not found" }, { status: 404 });

  // Record payment
  const { data: payment } = await supabase.from("payments").insert({
    farm_id, document_type: "purchase_invoice", document_id: bill_id,
    amount_rm, payment_method: payment_method || "cash",
    payment_date: new Date().toISOString().split("T")[0], reference, notes,
  }).select().single();

  // Update bill paid amount
  const newPaid = (bill.paid_rm || 0) + amount_rm;
  const newStatus = newPaid >= bill.total_rm ? "paid" : "partial";
  await supabase.from("purchase_invoices").update({ paid_rm: newPaid, status: newStatus }).eq("id", bill_id);

  return NextResponse.json({ payment, bill_status: newStatus });
}
