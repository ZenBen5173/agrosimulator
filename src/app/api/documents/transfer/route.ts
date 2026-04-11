import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Transfer a document to the next step in the chain.
 * QT→SO, SO→DO, DO→INV (sales)
 * RQ→PO, PO→GRN, GRN→BILL (purchase)
 */
export async function POST(request: Request) {
  const { farm_id, from_type, from_id } = await request.json();
  if (!farm_id || !from_type || !from_id) {
    return NextResponse.json({ error: "farm_id, from_type, from_id required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Determine target endpoint based on source type
  const transferMap: Record<string, { url: string; body: Record<string, string> }> = {
    quotation: { url: "/api/sales/orders", body: { farm_id, quotation_id: from_id } },
    sales_order: { url: "/api/sales/delivery", body: { farm_id, so_id: from_id } },
    delivery_order: { url: "/api/sales/invoices", body: { farm_id, do_id: from_id } },
    rfq: { url: "/api/purchase/orders", body: { farm_id, rq_id: from_id } },
    purchase_order: { url: "/api/purchase/grn", body: { farm_id, po_id: from_id } },
    grn: { url: "/api/purchase/invoices", body: { farm_id, grn_id: from_id } },
  };

  const transfer = transferMap[from_type];
  if (!transfer) {
    return NextResponse.json({ error: `Cannot transfer from ${from_type}` }, { status: 400 });
  }

  // Get source document to carry forward customer/supplier ID
  const tableMap: Record<string, string> = {
    quotation: "sales_quotations", sales_order: "sales_orders", delivery_order: "delivery_orders",
    rfq: "purchase_rfqs", purchase_order: "purchase_orders", grn: "goods_received_notes",
  };

  const { data: source } = await supabase.from(tableMap[from_type]).select("*").eq("id", from_id).single();
  if (!source) return NextResponse.json({ error: "Source document not found" }, { status: 404 });

  // Add contact ID to transfer body
  if (source.customer_id) transfer.body.customer_id = source.customer_id;
  if (source.supplier_id) transfer.body.supplier_id = source.supplier_id;

  // Call the target API internally
  const origin = new URL(request.url).origin;
  const res = await fetch(`${origin}${transfer.url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Cookie: request.headers.get("cookie") || "",
    },
    body: JSON.stringify(transfer.body),
  });

  const result = await res.json();
  return NextResponse.json(result, { status: res.status });
}
