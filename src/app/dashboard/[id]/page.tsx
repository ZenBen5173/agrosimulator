"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { createClient } from "@/lib/supabase/client";

interface Record {
  id: string;
  farm_id: string;
  plot_id: string | null;
  record_type: "expense" | "income";
  category: string;
  amount: number;
  description: string | null;
  record_date: string;
  created_at: string;
}

interface LinkedDoc {
  type: string;
  urlType: string;
  id: string;
  number: string;
  total: number;
}

export default function TransactionDetailPage() {
  const params = useParams();
  const router = useRouter();
  const recordId = params.id as string;
  const [record, setRecord] = useState<Record | null>(null);
  const [plotLabel, setPlotLabel] = useState<string | null>(null);
  const [linkedDocs, setLinkedDocs] = useState<LinkedDoc[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase.from("financial_records").select("*").eq("id", recordId).single();
      if (!data) { setLoading(false); return; }
      setRecord(data);

      if (data.plot_id) {
        const { data: plot } = await supabase.from("plots").select("label, crop_name").eq("id", data.plot_id).single();
        if (plot) setPlotLabel(`${plot.label} (${plot.crop_name})`);
      }

      // Try to find linked business documents by matching description (invoice numbers)
      const docs: LinkedDoc[] = [];
      const desc = data.description || "";

      // Check if description contains an invoice number
      const invMatch = desc.match(/INV-\d+/);
      if (invMatch) {
        const { data: inv } = await supabase.from("sales_invoices").select("id, inv_number, total_rm, so_id, do_id").eq("farm_id", data.farm_id).eq("inv_number", invMatch[0]).single();
        if (inv) {
          docs.push({ type: "Invoice", urlType: "sales_invoice", id: inv.id, number: inv.inv_number, total: inv.total_rm });
          // Trace the chain: INV → DO → SO
          if (inv.do_id) {
            const { data: d } = await supabase.from("delivery_orders").select("id, do_number, total_rm, so_id").eq("id", inv.do_id).single();
            if (d) {
              docs.push({ type: "Delivery Order", urlType: "delivery_order", id: d.id, number: d.do_number, total: d.total_rm });
              if (d.so_id) {
                const { data: s } = await supabase.from("sales_orders").select("id, so_number, total_rm, quotation_id").eq("id", d.so_id).single();
                if (s) {
                  docs.push({ type: "Sales Order", urlType: "sales_order", id: s.id, number: s.so_number, total: s.total_rm });
                  if (s.quotation_id) {
                    const { data: q } = await supabase.from("sales_quotations").select("id, qt_number, total_rm").eq("id", s.quotation_id).single();
                    if (q) docs.push({ type: "Quotation", urlType: "quotation", id: q.id, number: q.qt_number, total: q.total_rm });
                  }
                }
              }
            }
          }
          if (inv.so_id && !docs.find((d) => d.urlType === "sales_order")) {
            const { data: s } = await supabase.from("sales_orders").select("id, so_number, total_rm").eq("id", inv.so_id).single();
            if (s) docs.push({ type: "Sales Order", urlType: "sales_order", id: s.id, number: s.so_number, total: s.total_rm });
          }
        }
      }

      const billMatch = desc.match(/BILL-\d+|Bill \w+/);
      if (billMatch) {
        const { data: bill } = await supabase.from("purchase_invoices").select("id, bill_number, total_rm, po_id, grn_id").eq("farm_id", data.farm_id).eq("bill_number", billMatch[0]).single();
        if (bill) {
          docs.push({ type: "Purchase Invoice", urlType: "purchase_invoice", id: bill.id, number: bill.bill_number, total: bill.total_rm });
          if (bill.grn_id) {
            const { data: g } = await supabase.from("goods_received_notes").select("id, grn_number, total_rm").eq("id", bill.grn_id).single();
            if (g) docs.push({ type: "GRN", urlType: "grn", id: g.id, number: g.grn_number, total: g.total_rm });
          }
          if (bill.po_id) {
            const { data: p } = await supabase.from("purchase_orders").select("id, po_number, total_rm").eq("id", bill.po_id).single();
            if (p) docs.push({ type: "Purchase Order", urlType: "purchase_order", id: p.id, number: p.po_number, total: p.total_rm });
          }
        }
      }

      // If no doc number in description, try matching by amount + date + type
      if (docs.length === 0) {
        if (data.record_type === "income") {
          const { data: invs } = await supabase.from("sales_invoices")
            .select("id, inv_number, total_rm, so_id, do_id")
            .eq("farm_id", data.farm_id)
            .eq("total_rm", data.amount)
            .limit(1);
          if (invs && invs.length > 0) {
            const inv = invs[0];
            docs.push({ type: "Invoice", urlType: "sales_invoice", id: inv.id, number: inv.inv_number, total: inv.total_rm });
            if (inv.do_id) {
              const { data: d } = await supabase.from("delivery_orders").select("id, do_number, total_rm").eq("id", inv.do_id).single();
              if (d) docs.push({ type: "Delivery Order", urlType: "delivery_order", id: d.id, number: d.do_number, total: d.total_rm });
            }
            if (inv.so_id) {
              const { data: s } = await supabase.from("sales_orders").select("id, so_number, total_rm").eq("id", inv.so_id).single();
              if (s) docs.push({ type: "Sales Order", urlType: "sales_order", id: s.id, number: s.so_number, total: s.total_rm });
            }
          }
        } else {
          const { data: bills } = await supabase.from("purchase_invoices")
            .select("id, bill_number, total_rm, po_id, grn_id")
            .eq("farm_id", data.farm_id)
            .eq("total_rm", data.amount)
            .limit(1);
          if (bills && bills.length > 0) {
            const bill = bills[0];
            docs.push({ type: "Purchase Invoice", urlType: "purchase_invoice", id: bill.id, number: bill.bill_number, total: bill.total_rm });
            if (bill.po_id) {
              const { data: p } = await supabase.from("purchase_orders").select("id, po_number, total_rm").eq("id", bill.po_id).single();
              if (p) docs.push({ type: "Purchase Order", urlType: "purchase_order", id: p.id, number: p.po_number, total: p.total_rm });
            }
          }
        }
      }

      setLinkedDocs(docs);
      setLoading(false);
    }
    fetch();
  }, [recordId]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Transaction" breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "..." }]} />
        <div className="px-4 pt-4 space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
      </div>
    );
  }

  if (!record) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PageHeader title="Not Found" breadcrumbs={[{ label: "Accounts", href: "/dashboard" }]} />
        <div className="px-4 pt-12 text-center text-sm text-gray-400">Transaction not found</div>
      </div>
    );
  }

  const isIncome = record.record_type === "income";
  const fullDate = new Date(record.record_date + "T12:00:00").toLocaleDateString("en-MY", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const createdAt = new Date(record.created_at).toLocaleDateString("en-MY", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader title="Transaction" breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: record.category }]} />

      <div className="px-4 pt-3 space-y-3">
        {/* Amount */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-4 text-center">
            <p className={`text-2xl font-bold ${isIncome ? "text-green-600" : "text-red-500"}`}>
              {isIncome ? "+" : "-"}RM{record.amount.toFixed(2)}
            </p>
            <span className={`inline-block mt-1 text-[10px] font-medium px-2 py-0.5 rounded ${isIncome ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
              {isIncome ? "Income" : "Expense"}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Details</span>
          </div>
          <div className="divide-y divide-gray-50">
            <Row label="Category" value={record.category} />
            <Row label="Date" value={fullDate} />
            <Row label="Amount" value={`RM${record.amount.toFixed(2)}`} />
            <Row label="Type" value={isIncome ? "Income" : "Expense"} />
            {record.description && <Row label="Description" value={record.description} />}
            {plotLabel && <Row label="Plot" value={plotLabel} />}
            <Row label="Recorded" value={createdAt} />
          </div>
        </div>

        {/* Linked documents */}
        {linkedDocs.length > 0 && (
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="px-3 py-2 border-b border-gray-100">
              <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Related Documents</span>
            </div>
            {linkedDocs.map((doc) => (
              <button key={doc.id} onClick={() => router.push(`/business/${doc.urlType}/${doc.id}`)}
                className="w-full flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 text-left">
                <div>
                  <span className="text-xs font-medium text-gray-800">{doc.number}</span>
                  <span className="text-[10px] text-gray-400 ml-1.5">{doc.type}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-gray-500">RM{doc.total.toFixed(2)}</span>
                  <ArrowRight size={12} className="text-gray-300" />
                </div>
              </button>
            ))}
          </div>
        )}
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
