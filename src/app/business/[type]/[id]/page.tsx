"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { FileText, ArrowRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";
import { STATUS_LABELS } from "@/types/business";

interface LineItem {
  item_name: string;
  description: string | null;
  quantity: number;
  unit: string;
  unit_price_rm: number;
  total_rm: number;
}

interface LinkedDoc {
  label: string;
  number: string;
  type: string;
  id: string;
}

interface TxnDetail {
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
  linkedDocs: LinkedDoc[];
  createdAt: string;
}

const DOC_TITLES: Record<string, string> = {
  quotation: "Quotation", sales_order: "Sales Order", delivery_order: "Delivery Order",
  sales_invoice: "Invoice", rfq: "Request Quotation", purchase_order: "Purchase Order",
  grn: "Goods Received Note", purchase_invoice: "Purchase Invoice",
};

const TABLE_MAP: Record<string, { table: string; numberField: string; dateField: string; contactTable: string; contactIdField: string }> = {
  quotation: { table: "sales_quotations", numberField: "qt_number", dateField: "qt_date", contactTable: "customers", contactIdField: "customer_id" },
  sales_order: { table: "sales_orders", numberField: "so_number", dateField: "so_date", contactTable: "customers", contactIdField: "customer_id" },
  delivery_order: { table: "delivery_orders", numberField: "do_number", dateField: "do_date", contactTable: "customers", contactIdField: "customer_id" },
  sales_invoice: { table: "sales_invoices", numberField: "inv_number", dateField: "inv_date", contactTable: "customers", contactIdField: "customer_id" },
  rfq: { table: "purchase_rfqs", numberField: "rfq_number", dateField: "rfq_date", contactTable: "suppliers", contactIdField: "supplier_id" },
  purchase_order: { table: "purchase_orders", numberField: "po_number", dateField: "po_date", contactTable: "suppliers", contactIdField: "supplier_id" },
  grn: { table: "goods_received_notes", numberField: "grn_number", dateField: "grn_date", contactTable: "suppliers", contactIdField: "supplier_id" },
  purchase_invoice: { table: "purchase_invoices", numberField: "bill_number", dateField: "bill_date", contactTable: "suppliers", contactIdField: "supplier_id" },
};

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const docType = params.type as string;
  const docId = params.id as string;

  const [txn, setTxn] = useState<TxnDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const config = TABLE_MAP[docType];
      if (!config) { setLoading(false); return; }

      const supabase = createClient();
      const { data: rawDoc } = await supabase.from(config.table).select("*").eq("id", docId).single();
      if (!rawDoc) { setLoading(false); return; }

      // Contact
      let contactName = "—", contactPhone: string | null = null, contactAddress: string | null = null;
      const contactId = rawDoc[config.contactIdField];
      if (contactId) {
        const { data: c } = await supabase.from(config.contactTable).select("name, phone, address").eq("id", contactId).single();
        if (c) { contactName = c.name; contactPhone = c.phone; contactAddress = c.address; }
      }

      // Items
      const { data: items } = await supabase.from("document_items")
        .select("item_name, description, quantity, unit, unit_price_rm, total_rm")
        .eq("document_id", docId).eq("document_type", docType).order("created_at");

      // Linked docs
      const linked: LinkedDoc[] = [];
      const raw = rawDoc as Record<string, unknown>;
      const linkChecks: { field: string; table: string; numField: string; label: string; type: string }[] = [
        { field: "quotation_id", table: "sales_quotations", numField: "qt_number", label: "Quotation", type: "quotation" },
        { field: "so_id", table: "sales_orders", numField: "so_number", label: "Sales Order", type: "sales_order" },
        { field: "do_id", table: "delivery_orders", numField: "do_number", label: "Delivery Order", type: "delivery_order" },
        { field: "rq_id", table: "purchase_rfqs", numField: "rfq_number", label: "RQ", type: "rfq" },
        { field: "po_id", table: "purchase_orders", numField: "po_number", label: "Purchase Order", type: "purchase_order" },
        { field: "grn_id", table: "goods_received_notes", numField: "grn_number", label: "GRN", type: "grn" },
      ];
      for (const lc of linkChecks) {
        if (raw[lc.field]) {
          const { data: ld } = await supabase.from(lc.table).select("*").eq("id", raw[lc.field] as string).single();
          if (ld) {
            const ldObj = ld as Record<string, unknown>;
            linked.push({ label: lc.label, number: String(ldObj[lc.numField] || ""), type: lc.type, id: String(ldObj.id) });
          }
        }
      }

      setTxn({
        docNumber: rawDoc[config.numberField],
        docDate: rawDoc[config.dateField],
        dueDate: rawDoc.due_date || rawDoc.valid_until || null,
        status: rawDoc.status,
        totalRm: rawDoc.total_rm || 0,
        paidRm: rawDoc.paid_rm || 0,
        contactName, contactPhone, contactAddress,
        notes: rawDoc.notes || null,
        receivedBy: rawDoc.received_by || null,
        items: items || [],
        linkedDocs: linked,
        createdAt: rawDoc.created_at,
      });
      setLoading(false);
    }
    fetch();
  }, [docType, docId]);

  const title = DOC_TITLES[docType] || "Transaction";
  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "long", year: "numeric" });
  const isInvoice = docType === "sales_invoice" || docType === "purchase_invoice";

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title={title} breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Documents", href: "/business" }, { label: title }]} />
        <div className="px-4 pt-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      </div>
    );
  }

  if (!txn) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title={title} breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Documents", href: "/business" }, { label: title }]} />
        <div className="px-4 pt-12 text-center text-sm text-gray-400">Transaction not found</div>
      </div>
    );
  }

  const badge = STATUS_LABELS[txn.status] || { label: txn.status, cls: "bg-gray-100 text-gray-500" };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader title={`${title} ${txn.docNumber}`} breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Documents", href: "/business" }, { label: txn.docNumber }]} />

      <div className="px-4 pt-3 space-y-3">

        {/* Status + total header */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="flex items-center justify-between px-3 py-3">
            <div>
              <p className="text-lg font-bold text-gray-900">RM{txn.totalRm.toFixed(2)}</p>
              {isInvoice && txn.paidRm > 0 && txn.paidRm < txn.totalRm && (
                <p className="text-[10px] text-amber-600">RM{txn.paidRm.toFixed(2)} paid &middot; RM{(txn.totalRm - txn.paidRm).toFixed(2)} due</p>
              )}
            </div>
            <span className={`text-xs font-medium px-2.5 py-1 rounded ${badge.cls}`}>{badge.label}</span>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Details</span>
          </div>
          <div className="divide-y divide-gray-50">
            <Row label="Document" value={txn.docNumber} />
            <Row label="Date" value={formatDate(txn.docDate)} />
            {txn.dueDate && <Row label={docType === "quotation" ? "Valid Until" : "Due Date"} value={formatDate(txn.dueDate)} />}
            <Row label="Contact" value={txn.contactName} />
            {txn.contactPhone && <Row label="Phone" value={txn.contactPhone} />}
            {txn.contactAddress && <Row label="Address" value={txn.contactAddress} />}
            {txn.receivedBy && <Row label="Received By" value={txn.receivedBy} />}
            {txn.notes && <Row label="Notes" value={txn.notes} />}
          </div>
        </div>

        {/* Line items */}
        {txn.items.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Line Items</span>
            </div>
            <table className="w-full text-xs">
              <thead>
                <tr className="text-[10px] text-gray-400 border-b border-gray-50">
                  <th className="text-left font-medium px-3 py-1.5">Item</th>
                  <th className="text-right font-medium px-2 py-1.5">Qty</th>
                  <th className="text-right font-medium px-2 py-1.5">Price</th>
                  <th className="text-right font-medium px-3 py-1.5">Amount</th>
                </tr>
              </thead>
              <tbody>
                {txn.items.map((item, i) => (
                  <tr key={i} className="border-b border-gray-50 last:border-0">
                    <td className="px-3 py-2 text-gray-800">
                      {item.item_name}
                      {item.description && <p className="text-[10px] text-gray-400 mt-0.5">{item.description}</p>}
                    </td>
                    <td className="px-2 py-2 text-right text-gray-600">{item.quantity} {item.unit}</td>
                    <td className="px-2 py-2 text-right text-gray-600">{item.unit_price_rm.toFixed(2)}</td>
                    <td className="px-3 py-2 text-right font-medium text-gray-800">RM{item.total_rm.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200">
                  <td colSpan={3} className="px-3 py-2 text-right text-xs font-semibold text-gray-600">Total</td>
                  <td className="px-3 py-2 text-right text-sm font-bold text-gray-900">RM{txn.totalRm.toFixed(2)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}

        {/* Linked documents */}
        {txn.linkedDocs.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Related Documents</span>
            </div>
            {txn.linkedDocs.map((ld) => (
              <button key={ld.id} onClick={() => router.push(`/business/${ld.type}/${ld.id}`)}
                className="w-full flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 text-left">
                <div>
                  <span className="text-xs font-medium text-gray-800">{ld.number}</span>
                  <span className="text-[10px] text-gray-400 ml-1.5">{ld.label}</span>
                </div>
                <ArrowRight size={12} className="text-gray-300" />
              </button>
            ))}
          </div>
        )}

        {/* Preview document link */}
        <button
          onClick={() => router.push(`/documents/${docType}/${docId}`)}
          className="w-full rounded-lg border border-gray-200 bg-white px-3 py-3 flex items-center gap-2.5 hover:bg-gray-50 transition-colors"
        >
          <FileText size={16} className="text-gray-400" />
          <span className="flex-1 text-xs font-medium text-gray-700">Preview formal document</span>
          <span className="text-[10px] text-gray-400">Print / PDF</span>
          <ArrowRight size={12} className="text-gray-300" />
        </button>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between px-3 py-2">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-700 text-right max-w-[60%]">{value}</span>
    </div>
  );
}
