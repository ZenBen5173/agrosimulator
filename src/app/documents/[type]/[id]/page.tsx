"use client";

import { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { Printer, ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useFarmStore } from "@/stores/farmStore";

interface LineItem { item_name: string; description: string | null; quantity: number; unit: string; unit_price_rm: number; total_rm: number }
interface LinkedDoc { label: string; number: string }
interface DocData {
  docNumber: string; docDate: string; dueDate: string | null; status: string; totalRm: number; paidRm: number;
  contactName: string; contactPhone: string | null; contactAddress: string | null; notes: string | null; receivedBy: string | null;
  items: LineItem[]; linkedDocs: LinkedDoc[];
}

const DOC_CONFIG: Record<string, { title: string; accent: string; accentLight: string; headerBg: string; contactLabel: string }> = {
  quotation:        { title: "QUOTATION",         accent: "#2563eb", accentLight: "#dbeafe", headerBg: "#1e40af", contactLabel: "Prepared For" },
  sales_order:      { title: "SALES ORDER",       accent: "#059669", accentLight: "#d1fae5", headerBg: "#047857", contactLabel: "Customer" },
  delivery_order:   { title: "DELIVERY ORDER",    accent: "#7c3aed", accentLight: "#ede9fe", headerBg: "#6d28d9", contactLabel: "Deliver To" },
  sales_invoice:    { title: "INVOICE",           accent: "#dc2626", accentLight: "#fee2e2", headerBg: "#b91c1c", contactLabel: "Bill To" },
  rfq:              { title: "REQUEST FOR QUOTATION", accent: "#0891b2", accentLight: "#cffafe", headerBg: "#0e7490", contactLabel: "Supplier" },
  purchase_order:   { title: "PURCHASE ORDER",    accent: "#d97706", accentLight: "#fef3c7", headerBg: "#b45309", contactLabel: "Supplier" },
  grn:              { title: "GOODS RECEIVED NOTE", accent: "#16a34a", accentLight: "#dcfce7", headerBg: "#15803d", contactLabel: "Received From" },
  purchase_invoice: { title: "PURCHASE INVOICE",  accent: "#9333ea", accentLight: "#f3e8ff", headerBg: "#7e22ce", contactLabel: "Supplier" },
};

const TABLE_MAP: Record<string, { table: string; numField: string; dateField: string; contactTable: string; contactIdField: string }> = {
  quotation:        { table: "sales_quotations",     numField: "qt_number",   dateField: "qt_date",   contactTable: "customers", contactIdField: "customer_id" },
  sales_order:      { table: "sales_orders",         numField: "so_number",   dateField: "so_date",   contactTable: "customers", contactIdField: "customer_id" },
  delivery_order:   { table: "delivery_orders",      numField: "do_number",   dateField: "do_date",   contactTable: "customers", contactIdField: "customer_id" },
  sales_invoice:    { table: "sales_invoices",       numField: "inv_number",  dateField: "inv_date",  contactTable: "customers", contactIdField: "customer_id" },
  rfq:              { table: "purchase_rfqs",        numField: "rfq_number",  dateField: "rfq_date",  contactTable: "suppliers", contactIdField: "supplier_id" },
  purchase_order:   { table: "purchase_orders",      numField: "po_number",   dateField: "po_date",   contactTable: "suppliers", contactIdField: "supplier_id" },
  grn:              { table: "goods_received_notes",  numField: "grn_number",  dateField: "grn_date",  contactTable: "suppliers", contactIdField: "supplier_id" },
  purchase_invoice: { table: "purchase_invoices",    numField: "bill_number", dateField: "bill_date", contactTable: "suppliers", contactIdField: "supplier_id" },
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
      const { data: rawDoc } = await supabase.from(config.table).select("*").eq("id", docId).single();
      if (!rawDoc) { setLoading(false); return; }

      let contactName = "—", contactPhone: string | null = null, contactAddress: string | null = null;
      const contactId = rawDoc[config.contactIdField];
      if (contactId) {
        const { data: c } = await supabase.from(config.contactTable).select("name, phone, address").eq("id", contactId).single();
        if (c) { contactName = c.name; contactPhone = c.phone; contactAddress = c.address; }
      }

      const { data: items } = await supabase.from("document_items").select("item_name, description, quantity, unit, unit_price_rm, total_rm").eq("document_id", docId).eq("document_type", docType).order("created_at");

      const linked: LinkedDoc[] = [];
      const raw = rawDoc as Record<string, unknown>;
      const checks = [
        { f: "quotation_id", t: "sales_quotations", n: "qt_number", l: "Quotation" },
        { f: "so_id", t: "sales_orders", n: "so_number", l: "Sales Order" },
        { f: "do_id", t: "delivery_orders", n: "do_number", l: "Delivery Order" },
        { f: "rfq_id", t: "purchase_rfqs", n: "rfq_number", l: "RFQ" },
        { f: "po_id", t: "purchase_orders", n: "po_number", l: "Purchase Order" },
        { f: "grn_id", t: "goods_received_notes", n: "grn_number", l: "GRN" },
      ];
      for (const c of checks) {
        if (raw[c.f]) {
          const { data: d } = await supabase.from(c.t).select("*").eq("id", raw[c.f] as string).single();
          if (d) linked.push({ label: c.l, number: String((d as Record<string, unknown>)[c.n]) });
        }
      }

      setDoc({
        docNumber: rawDoc[config.numField], docDate: rawDoc[config.dateField],
        dueDate: rawDoc.due_date || rawDoc.valid_until || null,
        status: rawDoc.status, totalRm: rawDoc.total_rm || 0, paidRm: rawDoc.paid_rm || 0,
        contactName, contactPhone, contactAddress,
        notes: rawDoc.notes || null, receivedBy: rawDoc.received_by || null,
        items: items || [], linkedDocs: linked,
      });
      setLoading(false);
    }
    fetchDoc();
  }, [docType, docId]);

  if (loading) return <div className="min-h-screen bg-gray-100 flex items-center justify-center"><div className="animate-spin w-6 h-6 border-2 border-green-500 border-t-transparent rounded-full" /></div>;
  if (!doc) return <div className="min-h-screen bg-gray-100 flex items-center justify-center text-sm text-gray-500">Document not found</div>;

  const cfg = DOC_CONFIG[docType] || DOC_CONFIG.sales_invoice;
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" });
  const isInvoice = docType === "sales_invoice" || docType === "purchase_invoice";

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Action bar */}
      <div className="print:hidden sticky top-0 z-20 bg-white border-b border-gray-200 px-4 py-2.5 flex items-center justify-between">
        <button onClick={() => router.back()} className="flex items-center gap-1.5 text-xs text-gray-600"><ArrowLeft size={16} /> Back</button>
        <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs font-medium text-gray-700 bg-gray-100 px-3 py-1.5 rounded-lg"><Printer size={14} /> Print / PDF</button>
      </div>

      <div className="max-w-[210mm] mx-auto my-4 print:my-0 print:max-w-none" ref={printRef}>
        <div className="bg-white shadow-sm print:shadow-none min-h-[297mm]">

          {/* Colored header band */}
          <div className="px-8 pt-8 pb-6" style={{ borderBottom: `4px solid ${cfg.accent}` }}>
            <div className="flex justify-between items-start">
              <div>
                <h1 className="text-lg font-bold text-gray-900">{farm?.name || "AgroSimulator Farm"}</h1>
                <p className="text-[10px] text-gray-400 mt-0.5">Malaysia</p>
              </div>
              <div className="text-right">
                <div className="inline-block px-4 py-2 rounded" style={{ backgroundColor: cfg.accentLight }}>
                  <h2 className="text-sm font-bold tracking-widest" style={{ color: cfg.accent }}>{cfg.title}</h2>
                </div>
                <p className="text-base font-mono font-bold mt-2" style={{ color: cfg.accent }}>{doc.docNumber}</p>
              </div>
            </div>
          </div>

          <div className="px-8 py-6">
            {/* Info grid */}
            <div className="grid grid-cols-2 gap-8 mb-6">
              <div>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-1" style={{ color: cfg.accent }}>{cfg.contactLabel}</p>
                <p className="text-sm font-semibold text-gray-900">{doc.contactName}</p>
                {doc.contactPhone && <p className="text-xs text-gray-500">{doc.contactPhone}</p>}
                {doc.contactAddress && <p className="text-xs text-gray-500 mt-0.5">{doc.contactAddress}</p>}
              </div>
              <div className="text-right space-y-1 text-xs">
                <div><span className="text-gray-400">Date: </span><span className="text-gray-800 font-medium">{formatDate(doc.docDate)}</span></div>
                {doc.dueDate && <div><span className="text-gray-400">{docType === "quotation" ? "Valid Until: " : "Due Date: "}</span><span className="text-gray-800 font-medium">{formatDate(doc.dueDate)}</span></div>}
                {doc.linkedDocs.length > 0 && <div className="text-[10px] text-gray-400 mt-1">Ref: {doc.linkedDocs.map((d) => `${d.number}`).join(", ")}</div>}
              </div>
            </div>

            {/* Line items */}
            <table className="w-full text-sm mb-6">
              <thead>
                <tr style={{ backgroundColor: cfg.accentLight }}>
                  <th className="text-left py-2 pl-3 pr-2 text-[10px] font-bold uppercase" style={{ color: cfg.accent }}>#</th>
                  <th className="text-left py-2 px-2 text-[10px] font-bold uppercase" style={{ color: cfg.accent }}>Description</th>
                  <th className="text-right py-2 px-2 text-[10px] font-bold uppercase w-14" style={{ color: cfg.accent }}>Qty</th>
                  <th className="text-left py-2 px-2 text-[10px] font-bold uppercase w-10" style={{ color: cfg.accent }}>Unit</th>
                  <th className="text-right py-2 px-2 text-[10px] font-bold uppercase w-20" style={{ color: cfg.accent }}>Price</th>
                  <th className="text-right py-2 pl-2 pr-3 text-[10px] font-bold uppercase w-24" style={{ color: cfg.accent }}>Amount (RM)</th>
                </tr>
              </thead>
              <tbody>
                {doc.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-100">
                    <td className="py-2.5 pl-3 pr-2 text-gray-400">{i + 1}</td>
                    <td className="py-2.5 px-2">
                      <p className="font-medium text-gray-800">{item.item_name}</p>
                      {item.description && <p className="text-[10px] text-gray-400 mt-0.5">{item.description}</p>}
                    </td>
                    <td className="py-2.5 px-2 text-right text-gray-700">{item.quantity}</td>
                    <td className="py-2.5 px-2 text-gray-500">{item.unit}</td>
                    <td className="py-2.5 px-2 text-right text-gray-700">{item.unit_price_rm.toFixed(2)}</td>
                    <td className="py-2.5 pl-2 pr-3 text-right font-medium text-gray-900">{item.total_rm.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            {/* Totals */}
            <div className="flex justify-end mb-8">
              <div className="w-56">
                <div className="flex justify-between py-1.5 text-sm"><span className="text-gray-500">Subtotal</span><span className="text-gray-800">RM {doc.totalRm.toFixed(2)}</span></div>
                {isInvoice && (
                  <>
                    <div className="flex justify-between py-1.5 text-sm"><span className="text-gray-500">Paid</span><span className="text-green-600">RM {doc.paidRm.toFixed(2)}</span></div>
                    <div className="flex justify-between py-2 text-sm font-bold" style={{ borderTop: `2px solid ${cfg.accent}` }}>
                      <span style={{ color: cfg.accent }}>Balance Due</span>
                      <span style={{ color: cfg.accent }}>RM {(doc.totalRm - doc.paidRm).toFixed(2)}</span>
                    </div>
                  </>
                )}
                {!isInvoice && (
                  <div className="flex justify-between py-2 text-sm font-bold" style={{ borderTop: `2px solid ${cfg.accent}` }}>
                    <span style={{ color: cfg.accent }}>Total</span>
                    <span style={{ color: cfg.accent }}>RM {doc.totalRm.toFixed(2)}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notes */}
            {doc.notes && (
              <div className="mb-4 rounded p-3" style={{ backgroundColor: cfg.accentLight }}>
                <p className="text-[9px] font-bold uppercase tracking-widest mb-0.5" style={{ color: cfg.accent }}>Notes</p>
                <p className="text-xs text-gray-700">{doc.notes}</p>
              </div>
            )}

            {doc.receivedBy && (
              <div className="mb-4"><p className="text-[10px] text-gray-400">Received By: <span className="text-gray-700 font-medium">{doc.receivedBy}</span></p></div>
            )}

            {/* Signatures */}
            <div className="grid grid-cols-2 gap-12 mt-12 pt-4">
              <div>
                <div className="mb-1 h-10" style={{ borderBottom: `1px solid ${cfg.accent}` }} />
                <p className="text-[10px] text-gray-400">Authorized Signature</p>
              </div>
              <div>
                <div className="mb-1 h-10" style={{ borderBottom: `1px solid ${cfg.accent}` }} />
                <p className="text-[10px] text-gray-400">Acknowledgement</p>
              </div>
            </div>

            {/* Footer */}
            <div className="mt-10 pt-3 border-t border-gray-200 flex justify-between text-[8px] text-gray-400">
              <span>Generated by AgroSimulator</span>
              <span>{new Date().toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric" })}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
