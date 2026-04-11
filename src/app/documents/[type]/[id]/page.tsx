"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, Download, ArrowLeft, Share2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";

interface LineItem {
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price_rm: number;
  total_rm: number;
}

interface DocData {
  docNumber: string;
  docDate: string;
  dueDate: string | null;
  status: string;
  totalRm: number;
  paidRm: number;
  contactName: string;
  contactPhone: string | null;
  contactAddress: string | null;
  notes: string | null;
  receivedBy: string | null;
  items: LineItem[];
  linkedDocs: { label: string; number: string }[];
}

const DOC_TITLES: Record<string, string> = {
  quotation: "Quotation",
  sales_order: "Sales Order",
  delivery_order: "Delivery Order",
  sales_invoice: "Invoice",
  rfq: "Request for Quotation",
  purchase_order: "Purchase Order",
  grn: "Goods Received Note",
  purchase_invoice: "Purchase Invoice",
};

const TABLE_MAP: Record<string, { table: string; numberField: string; dateField: string; contactType: string; contactTable: string; contactIdField: string }> = {
  quotation: { table: "sales_quotations", numberField: "qt_number", dateField: "qt_date", contactType: "Customer", contactTable: "customers", contactIdField: "customer_id" },
  sales_order: { table: "sales_orders", numberField: "so_number", dateField: "so_date", contactType: "Customer", contactTable: "customers", contactIdField: "customer_id" },
  delivery_order: { table: "delivery_orders", numberField: "do_number", dateField: "do_date", contactType: "Customer", contactTable: "customers", contactIdField: "customer_id" },
  sales_invoice: { table: "sales_invoices", numberField: "inv_number", dateField: "inv_date", contactType: "Customer", contactTable: "customers", contactIdField: "customer_id" },
  rfq: { table: "purchase_rfqs", numberField: "rfq_number", dateField: "rfq_date", contactType: "Supplier", contactTable: "suppliers", contactIdField: "supplier_id" },
  purchase_order: { table: "purchase_orders", numberField: "po_number", dateField: "po_date", contactType: "Supplier", contactTable: "suppliers", contactIdField: "supplier_id" },
  grn: { table: "goods_received_notes", numberField: "grn_number", dateField: "grn_date", contactType: "Supplier", contactTable: "suppliers", contactIdField: "supplier_id" },
  purchase_invoice: { table: "purchase_invoices", numberField: "bill_number", dateField: "bill_date", contactType: "Supplier", contactTable: "suppliers", contactIdField: "supplier_id" },
};

export default function DocumentPreview() {
  const params = useParams();
  const router = useRouter();
  const docType = params.type as string;
  const docId = params.id as string;
  const farm = useFarmStore((s) => s.farm);
  const printRef = useRef<HTMLDivElement>(null);

  const [doc, setDoc] = useState<DocData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchDoc() {
      const config = TABLE_MAP[docType];
      if (!config) { setLoading(false); return; }

      const supabase = createClient();

      // Fetch document
      const { data: rawDoc } = await supabase
        .from(config.table)
        .select("*")
        .eq("id", docId)
        .single();

      if (!rawDoc) { setLoading(false); return; }

      // Fetch contact
      let contactName = "—";
      let contactPhone: string | null = null;
      let contactAddress: string | null = null;
      const contactId = rawDoc[config.contactIdField];
      if (contactId) {
        const { data: contact } = await supabase
          .from(config.contactTable)
          .select("name, phone, address")
          .eq("id", contactId)
          .single();
        if (contact) {
          contactName = contact.name;
          contactPhone = contact.phone;
          contactAddress = contact.address;
        }
      }

      // Fetch line items
      const { data: items } = await supabase
        .from("document_items")
        .select("item_name, description, quantity, unit, unit_price_rm, total_rm")
        .eq("document_id", docId)
        .eq("document_type", docType)
        .order("created_at");

      // Find linked documents
      const linkedDocs: { label: string; number: string }[] = [];
      if (rawDoc.quotation_id) {
        const { data: qt } = await supabase.from("sales_quotations").select("qt_number").eq("id", rawDoc.quotation_id).single();
        if (qt) linkedDocs.push({ label: "Quotation", number: qt.qt_number });
      }
      if (rawDoc.so_id) {
        const { data: so } = await supabase.from("sales_orders").select("so_number").eq("id", rawDoc.so_id).single();
        if (so) linkedDocs.push({ label: "Sales Order", number: so.so_number });
      }
      if (rawDoc.do_id) {
        const { data: deliveryOrder } = await supabase.from("delivery_orders").select("do_number").eq("id", rawDoc.do_id).single();
        if (deliveryOrder) linkedDocs.push({ label: "Delivery Order", number: deliveryOrder.do_number });
      }
      if (rawDoc.rfq_id) {
        const { data: rfq } = await supabase.from("purchase_rfqs").select("rfq_number").eq("id", rawDoc.rfq_id).single();
        if (rfq) linkedDocs.push({ label: "RFQ", number: rfq.rfq_number });
      }
      if (rawDoc.po_id) {
        const { data: po } = await supabase.from("purchase_orders").select("po_number").eq("id", rawDoc.po_id).single();
        if (po) linkedDocs.push({ label: "Purchase Order", number: po.po_number });
      }
      if (rawDoc.grn_id) {
        const { data: grn } = await supabase.from("goods_received_notes").select("grn_number").eq("id", rawDoc.grn_id).single();
        if (grn) linkedDocs.push({ label: "GRN", number: grn.grn_number });
      }

      setDoc({
        docNumber: rawDoc[config.numberField],
        docDate: rawDoc[config.dateField],
        dueDate: rawDoc.due_date || rawDoc.valid_until || null,
        status: rawDoc.status,
        totalRm: rawDoc.total_rm || 0,
        paidRm: rawDoc.paid_rm || 0,
        contactName,
        contactPhone,
        contactAddress,
        notes: rawDoc.notes || null,
        receivedBy: rawDoc.received_by || null,
        items: items || [],
        linkedDocs,
      });
      setLoading(false);
    }

    fetchDoc();
  }, [docType, docId]);

  const handlePrint = () => window.print();

  const title = DOC_TITLES[docType] || "Document";
  const contactLabel = TABLE_MAP[docType]?.contactType || "Contact";
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
  const isSalesDoc = ["quotation", "sales_order", "delivery_order", "sales_invoice"].includes(docType);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  if (!doc) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">
        Document not found
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Action bar (hidden in print) */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-xs text-gray-600">
          <ArrowLeft size={16} /> Back
        </button>
        <div className="flex items-center gap-2">
          <button onClick={handlePrint} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg">
            <Printer size={14} /> Print / PDF
          </button>
        </div>
      </div>

      {/* Document */}
      <div className="max-w-[210mm] mx-auto my-4 print:my-0 print:max-w-none" ref={printRef}>
        <div className="bg-white shadow-sm print:shadow-none p-8 print:p-10 min-h-[297mm]">

          {/* Header */}
          <div className="flex justify-between items-start mb-8 border-b-2 border-gray-900 pb-6">
            <div>
              <h1 className="text-xl font-bold text-gray-900">{farm?.name || "AgroSimulator Farm"}</h1>
              <p className="text-xs text-gray-500 mt-1">
                Malaysia
              </p>
            </div>
            <div className="text-right">
              <h2 className="text-lg font-bold text-gray-900 uppercase tracking-wide">{title}</h2>
              <p className="text-sm font-mono text-gray-700 mt-1">{doc.docNumber}</p>
            </div>
          </div>

          {/* Document info grid */}
          <div className="grid grid-cols-2 gap-8 mb-8">
            {/* Left: Contact */}
            <div>
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">
                {isSalesDoc ? "Bill To" : "Supplier"}
              </p>
              <p className="text-sm font-semibold text-gray-900">{doc.contactName}</p>
              {doc.contactPhone && <p className="text-xs text-gray-500">{doc.contactPhone}</p>}
              {doc.contactAddress && <p className="text-xs text-gray-500 mt-0.5">{doc.contactAddress}</p>}
            </div>

            {/* Right: Document details */}
            <div className="text-right space-y-1">
              <div className="flex justify-end gap-6 text-xs">
                <div>
                  <p className="text-gray-400">Date</p>
                  <p className="text-gray-800 font-medium">{formatDate(doc.docDate)}</p>
                </div>
                {doc.dueDate && (
                  <div>
                    <p className="text-gray-400">{docType === "quotation" ? "Valid Until" : "Due Date"}</p>
                    <p className="text-gray-800 font-medium">{formatDate(doc.dueDate)}</p>
                  </div>
                )}
              </div>
              {doc.linkedDocs.length > 0 && (
                <div className="text-[10px] text-gray-400 mt-2">
                  Ref: {doc.linkedDocs.map((d) => `${d.label} ${d.number}`).join(", ")}
                </div>
              )}
            </div>
          </div>

          {/* Line items table */}
          <table className="w-full text-sm mb-8">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-2 pr-2 text-xs font-semibold text-gray-600 w-8">#</th>
                <th className="text-left py-2 pr-2 text-xs font-semibold text-gray-600">Description</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600 w-16">Qty</th>
                <th className="text-left py-2 px-2 text-xs font-semibold text-gray-600 w-12">Unit</th>
                <th className="text-right py-2 px-2 text-xs font-semibold text-gray-600 w-24">Unit Price</th>
                <th className="text-right py-2 pl-2 text-xs font-semibold text-gray-600 w-24">Amount (RM)</th>
              </tr>
            </thead>
            <tbody>
              {doc.items.map((item, i) => (
                <tr key={i} className="border-b border-gray-200">
                  <td className="py-2.5 pr-2 text-gray-400">{i + 1}</td>
                  <td className="py-2.5 pr-2">
                    <p className="font-medium text-gray-800">{item.item_name}</p>
                    {item.description && <p className="text-xs text-gray-400 mt-0.5">{item.description}</p>}
                  </td>
                  <td className="py-2.5 px-2 text-right text-gray-700">{item.quantity}</td>
                  <td className="py-2.5 px-2 text-gray-500">{item.unit}</td>
                  <td className="py-2.5 px-2 text-right text-gray-700">{item.unit_price_rm.toFixed(2)}</td>
                  <td className="py-2.5 pl-2 text-right font-medium text-gray-900">{item.total_rm.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Totals */}
          <div className="flex justify-end mb-8">
            <div className="w-64">
              <div className="flex justify-between py-1.5 text-sm">
                <span className="text-gray-500">Subtotal</span>
                <span className="text-gray-800">RM {doc.totalRm.toFixed(2)}</span>
              </div>
              {(docType === "sales_invoice" || docType === "purchase_invoice") && (
                <>
                  <div className="flex justify-between py-1.5 text-sm">
                    <span className="text-gray-500">Paid</span>
                    <span className="text-green-600">RM {doc.paidRm.toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between py-1.5 text-sm border-t-2 border-gray-900">
                    <span className="font-bold text-gray-900">Balance Due</span>
                    <span className="font-bold text-gray-900">RM {(doc.totalRm - doc.paidRm).toFixed(2)}</span>
                  </div>
                </>
              )}
              {docType !== "sales_invoice" && docType !== "purchase_invoice" && (
                <div className="flex justify-between py-1.5 text-sm border-t-2 border-gray-900">
                  <span className="font-bold text-gray-900">Total</span>
                  <span className="font-bold text-gray-900">RM {doc.totalRm.toFixed(2)}</span>
                </div>
              )}
            </div>
          </div>

          {/* Notes / Terms */}
          {doc.notes && (
            <div className="mb-6">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Notes</p>
              <p className="text-xs text-gray-600">{doc.notes}</p>
            </div>
          )}

          {doc.receivedBy && (
            <div className="mb-6">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Received By</p>
              <p className="text-xs text-gray-600">{doc.receivedBy}</p>
            </div>
          )}

          {/* Signature lines */}
          <div className="grid grid-cols-2 gap-12 mt-16 pt-4">
            <div>
              <div className="border-b border-gray-300 mb-1 h-12" />
              <p className="text-[10px] text-gray-400">Authorized Signature</p>
              <p className="text-xs text-gray-600">{farm?.name || "Farm Owner"}</p>
            </div>
            <div>
              <div className="border-b border-gray-300 mb-1 h-12" />
              <p className="text-[10px] text-gray-400">{isSalesDoc ? "Customer" : "Supplier"} Acknowledgement</p>
              <p className="text-xs text-gray-600">{doc.contactName}</p>
            </div>
          </div>

          {/* Footer */}
          <div className="mt-12 pt-4 border-t border-gray-200 text-center">
            <p className="text-[9px] text-gray-400">
              Generated by AgroSimulator &middot; {new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
