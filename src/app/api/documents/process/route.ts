import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getNextDocNumber, insertDocumentItems, updateInventoryStock } from "@/lib/business";

/**
 * POST — Process a scanned document into the correct business documents.
 * Takes the AI-extracted data and creates: contact, business doc, financial record, inventory update.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { farm_id, document_type, direction, contact_name, contact_phone, document_date, due_date, items, total_amount_rm, notes } = body;

    if (!farm_id || !document_type || !items?.length) {
      return NextResponse.json({ error: "farm_id, document_type, items required" }, { status: 400 });
    }

    const today = new Date().toISOString().split("T")[0];
    const docDate = document_date || today;
    const dueDate = due_date || new Date(Date.now() + 30 * 86400000).toISOString().split("T")[0];
    const created: { type: string; number: string; id: string }[] = [];

    // 1. Find or create contact
    let contactId: string | null = null;
    if (contact_name) {
      if (direction === "purchase") {
        const { data: existing } = await supabase.from("suppliers").select("id").eq("farm_id", farm_id).ilike("name", `%${contact_name}%`).limit(1).single();
        if (existing) {
          contactId = existing.id;
        } else {
          const { data: newSupplier } = await supabase.from("suppliers").insert({ farm_id, name: contact_name, phone: contact_phone }).select().single();
          if (newSupplier) contactId = newSupplier.id;
        }
      } else {
        const { data: existing } = await supabase.from("customers").select("id").eq("farm_id", farm_id).ilike("name", `%${contact_name}%`).limit(1).single();
        if (existing) {
          contactId = existing.id;
        } else {
          const { data: newCustomer } = await supabase.from("customers").insert({ farm_id, name: contact_name, phone: contact_phone }).select().single();
          if (newCustomer) contactId = newCustomer.id;
        }
      }
    }

    // 2. Create business documents based on type
    if (direction === "purchase") {
      // Purchase flow: create PO → GRN → Bill depending on doc type
      if (document_type === "supplier_quotation") {
        const num = await getNextDocNumber(farm_id, "RFQ", "purchase_rfqs");
        const { data: rfq } = await supabase.from("purchase_rfqs").insert({
          farm_id, supplier_id: contactId, rfq_number: num, rfq_date: docDate, status: "quoted", notes, total_rm: total_amount_rm,
        }).select().single();
        if (rfq) {
          await insertDocumentItems(rfq.id, "rfq", items);
          created.push({ type: "RFQ", number: num, id: rfq.id });
        }
      } else if (document_type === "purchase_order") {
        const num = await getNextDocNumber(farm_id, "PO", "purchase_orders");
        const { data: po } = await supabase.from("purchase_orders").insert({
          farm_id, supplier_id: contactId, po_number: num, po_date: docDate, status: "confirmed", total_rm: total_amount_rm,
        }).select().single();
        if (po) {
          await insertDocumentItems(po.id, "purchase_order", items);
          created.push({ type: "PO", number: num, id: po.id });
        }
      } else {
        // supplier_invoice or supplier_receipt — create full chain: PO → GRN → Bill
        // PO
        const poNum = await getNextDocNumber(farm_id, "PO", "purchase_orders");
        const { data: po } = await supabase.from("purchase_orders").insert({
          farm_id, supplier_id: contactId, po_number: poNum, po_date: docDate, status: "received", total_rm: total_amount_rm,
        }).select().single();
        if (po) {
          await insertDocumentItems(po.id, "purchase_order", items);
          created.push({ type: "PO", number: poNum, id: po.id });

          // GRN
          const grnNum = await getNextDocNumber(farm_id, "GRN", "goods_received_notes");
          const { data: grn } = await supabase.from("goods_received_notes").insert({
            farm_id, po_id: po.id, supplier_id: contactId, grn_number: grnNum, grn_date: docDate, total_rm: total_amount_rm, received_by: "Auto",
          }).select().single();
          if (grn) {
            await insertDocumentItems(grn.id, "grn", items);
            created.push({ type: "GRN", number: grnNum, id: grn.id });

            // Update inventory stock
            await updateInventoryStock(farm_id, items.map((i: { item_name: string; quantity: number; unit: string; unit_price_rm: number }) => ({
              item_name: i.item_name, quantity: i.quantity, unit: i.unit, unit_price_rm: i.unit_price_rm,
            })), "increase", `${grnNum} (scanned)`);

            // Bill
            const billNum = await getNextDocNumber(farm_id, "BILL", "purchase_invoices");
            const { data: bill } = await supabase.from("purchase_invoices").insert({
              farm_id, supplier_id: contactId, po_id: po.id, grn_id: grn.id, bill_number: billNum, bill_date: docDate, due_date: dueDate,
              status: document_type === "supplier_receipt" ? "paid" : "unpaid", total_rm: total_amount_rm, paid_rm: document_type === "supplier_receipt" ? total_amount_rm : 0,
            }).select().single();
            if (bill) {
              await insertDocumentItems(bill.id, "purchase_invoice", items);
              created.push({ type: "Bill", number: billNum, id: bill.id });
            }

            // Financial record
            await supabase.from("financial_records").insert({
              farm_id, record_type: "expense", category: "Purchase",
              amount: total_amount_rm, description: `${contact_name || "Supplier"} (${billNum})`, record_date: docDate,
            });
          }
        }
      }
    } else {
      // Sales flow: create SO → DO → INV
      const soNum = await getNextDocNumber(farm_id, "SO", "sales_orders");
      const { data: so } = await supabase.from("sales_orders").insert({
        farm_id, customer_id: contactId, so_number: soNum, so_date: docDate, status: "fulfilled", total_rm: total_amount_rm,
      }).select().single();
      if (so) {
        await insertDocumentItems(so.id, "sales_order", items);
        created.push({ type: "SO", number: soNum, id: so.id });

        // DO
        const doNum = await getNextDocNumber(farm_id, "DO", "delivery_orders");
        const { data: deliveryOrder } = await supabase.from("delivery_orders").insert({
          farm_id, customer_id: contactId, so_id: so.id, do_number: doNum, do_date: docDate, status: "delivered", total_rm: total_amount_rm,
        }).select().single();
        if (deliveryOrder) {
          await insertDocumentItems(deliveryOrder.id, "delivery_order", items);
          created.push({ type: "DO", number: doNum, id: deliveryOrder.id });

          // Decrease inventory
          await updateInventoryStock(farm_id, items.map((i: { item_name: string; quantity: number; unit: string; unit_price_rm: number }) => ({
            item_name: i.item_name, quantity: i.quantity, unit: i.unit, unit_price_rm: i.unit_price_rm,
          })), "decrease", `${doNum} (scanned)`);
        }

        // Invoice
        const invNum = await getNextDocNumber(farm_id, "INV", "sales_invoices");
        const isPaid = document_type === "customer_receipt";
        const { data: inv } = await supabase.from("sales_invoices").insert({
          farm_id, customer_id: contactId, so_id: so.id, do_id: deliveryOrder?.id, inv_number: invNum, inv_date: docDate, due_date: dueDate,
          status: isPaid ? "paid" : "unpaid", total_rm: total_amount_rm, paid_rm: isPaid ? total_amount_rm : 0,
        }).select().single();
        if (inv) {
          await insertDocumentItems(inv.id, "sales_invoice", items);
          created.push({ type: "INV", number: invNum, id: inv.id });
        }

        // Financial record
        await supabase.from("financial_records").insert({
          farm_id, record_type: "income", category: "Sales",
          amount: total_amount_rm, description: `${contact_name || "Customer"} (${invNum})`, record_date: docDate,
        });

        // Update customer outstanding
        if (contactId && !isPaid) {
          const { data: cust } = await supabase.from("customers").select("total_outstanding_rm").eq("id", contactId).single();
          if (cust) {
            await supabase.from("customers").update({ total_outstanding_rm: (cust.total_outstanding_rm || 0) + total_amount_rm }).eq("id", contactId);
          }
        }
      }
    }

    return NextResponse.json({ created, total: total_amount_rm, direction });
  } catch (err) {
    console.error("Document process error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
