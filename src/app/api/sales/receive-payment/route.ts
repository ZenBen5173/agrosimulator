import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { farm_id, invoice_id, amount_rm, payment_method, reference, notes } = await request.json();
  if (!farm_id || !invoice_id || !amount_rm) return NextResponse.json({ error: "farm_id, invoice_id, amount_rm required" }, { status: 400 });

  const { data: inv } = await supabase.from("sales_invoices").select("*, customers(id, total_outstanding_rm)").eq("id", invoice_id).single();
  if (!inv) return NextResponse.json({ error: "Invoice not found" }, { status: 404 });

  // Record payment
  const { data: payment } = await supabase.from("payments").insert({
    farm_id, document_type: "sales_invoice", document_id: invoice_id,
    amount_rm, payment_method: payment_method || "cash",
    payment_date: new Date().toISOString().split("T")[0], reference, notes,
  }).select().single();

  // Update invoice paid amount
  const newPaid = (inv.paid_rm || 0) + amount_rm;
  const newStatus = newPaid >= inv.total_rm ? "paid" : "partial";
  await supabase.from("sales_invoices").update({ paid_rm: newPaid, status: newStatus }).eq("id", invoice_id);

  // Reduce customer outstanding
  if (inv.customer_id) {
    const outstanding = (inv.customers?.total_outstanding_rm || 0) - amount_rm;
    await supabase.from("customers").update({ total_outstanding_rm: Math.max(0, outstanding) }).eq("id", inv.customer_id);
  }

  return NextResponse.json({ payment, invoice_status: newStatus });
}
