"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Plus, ArrowRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";
import { STATUS_LABELS } from "@/types/business";

type Tab = "overview" | "purchase" | "sales" | "contacts";

interface DocRow { id: string; number: string; date: string; status: string; total_rm: number; contact: string; type: string }

export default function BusinessPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const [tab, setTab] = useState<Tab>("overview");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [items, setItems] = useState<{ document_id: string; item_name: string; quantity: number; unit: string; unit_price_rm: number; total_rm: number }[]>([]);

  // Data
  const [customers, setCustomers] = useState<{ id: string; name: string; phone: string | null; total_outstanding_rm: number }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; phone: string | null }[]>([]);
  const [purchaseDocs, setPurchaseDocs] = useState<DocRow[]>([]);
  const [salesDocs, setSalesDocs] = useState<DocRow[]>([]);

  const fetchAll = useCallback(async () => {
    if (!farmId) return;
    setLoading(true);
    try {
      const [custRes, suppRes, rfqRes, poRes, pInvRes, qtRes, soRes, sInvRes] = await Promise.all([
        fetch(`/api/contacts/customers?farm_id=${farmId}`),
        fetch(`/api/contacts/suppliers?farm_id=${farmId}`),
        fetch(`/api/purchase/rfq?farm_id=${farmId}`),
        fetch(`/api/purchase/orders?farm_id=${farmId}`),
        fetch(`/api/purchase/invoices?farm_id=${farmId}`),
        fetch(`/api/sales/quotations?farm_id=${farmId}`),
        fetch(`/api/sales/orders?farm_id=${farmId}`),
        fetch(`/api/sales/invoices?farm_id=${farmId}`),
      ]);

      const [cust, supp, rfqs, pos, pInvs, qts, sos, sInvs] = await Promise.all([
        custRes.ok ? custRes.json() : [], suppRes.ok ? suppRes.json() : [],
        rfqRes.ok ? rfqRes.json() : [], poRes.ok ? poRes.json() : [],
        pInvRes.ok ? pInvRes.json() : [],
        qtRes.ok ? qtRes.json() : [], soRes.ok ? soRes.json() : [],
        sInvRes.ok ? sInvRes.json() : [],
      ]);

      setCustomers(cust); setSuppliers(supp);

      // Normalize purchase docs
      const pDocs: DocRow[] = [
        ...rfqs.map((d: Record<string, unknown>) => ({ id: d.id as string, number: d.rfq_number as string, date: d.rfq_date as string, status: d.status as string, total_rm: d.total_rm as number, contact: (d.suppliers as Record<string, string>)?.name || "—", type: "RFQ" })),
        ...pos.map((d: Record<string, unknown>) => ({ id: d.id as string, number: d.po_number as string, date: d.po_date as string, status: d.status as string, total_rm: d.total_rm as number, contact: (d.suppliers as Record<string, string>)?.name || "—", type: "PO" })),
        ...pInvs.map((d: Record<string, unknown>) => ({ id: d.id as string, number: d.bill_number as string, date: d.bill_date as string, status: d.status as string, total_rm: d.total_rm as number, contact: (d.suppliers as Record<string, string>)?.name || "—", type: "Bill" })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      setPurchaseDocs(pDocs);

      // Normalize sales docs
      const sDocs: DocRow[] = [
        ...qts.map((d: Record<string, unknown>) => ({ id: d.id as string, number: d.qt_number as string, date: d.qt_date as string, status: d.status as string, total_rm: d.total_rm as number, contact: (d.customers as Record<string, string>)?.name || "—", type: "QT" })),
        ...sos.map((d: Record<string, unknown>) => ({ id: d.id as string, number: d.so_number as string, date: d.so_date as string, status: d.status as string, total_rm: d.total_rm as number, contact: (d.customers as Record<string, string>)?.name || "—", type: "SO" })),
        ...sInvs.map((d: Record<string, unknown>) => ({ id: d.id as string, number: d.inv_number as string, date: d.inv_date as string, status: d.status as string, total_rm: d.total_rm as number, contact: (d.customers as Record<string, string>)?.name || "—", type: "INV" })),
      ].sort((a, b) => b.date.localeCompare(a.date));
      setSalesDocs(sDocs);
    } catch (err) { console.error(err); }
    finally { setLoading(false); }
  }, [farmId]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Fetch line items for expanded doc
  const handleExpand = async (doc: DocRow) => {
    if (expandedId === doc.id) { setExpandedId(null); return; }
    setExpandedId(doc.id);
    const typeMap: Record<string, string> = { RFQ: "rfq", PO: "purchase_order", GRN: "grn", Bill: "purchase_invoice", QT: "quotation", SO: "sales_order", DO: "delivery_order", INV: "sales_invoice" };
    // Items are fetched via the document_items table — for now show from cached data or make a simple query
    // Since we don't have a dedicated items endpoint, we'll show the total
    setItems([]);
  };

  const totalReceivable = salesDocs.filter((d) => d.type === "INV" && d.status !== "paid").reduce((s, d) => s + d.total_rm, 0);
  const totalPayable = purchaseDocs.filter((d) => d.type === "Bill" && d.status !== "paid").reduce((s, d) => s + d.total_rm, 0);

  // AI Summary
  const summaryParts: string[] = [];
  if (totalReceivable > 0) summaryParts.push(`RM${totalReceivable.toFixed(2)} outstanding from customers`);
  if (totalPayable > 0) summaryParts.push(`RM${totalPayable.toFixed(2)} owed to suppliers`);
  if (salesDocs.length === 0 && purchaseDocs.length === 0) summaryParts.push("No business documents yet");
  const overdueInv = salesDocs.filter((d) => d.type === "INV" && d.status === "unpaid");
  if (overdueInv.length > 0) summaryParts.push(`${overdueInv.length} unpaid invoice${overdueInv.length > 1 ? "s" : ""}`);

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "purchase", label: "Purchase" },
    { key: "sales", label: "Sales" },
    { key: "contacts", label: "Contacts" },
  ];

  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" });

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader title="Business" />

      {/* Tabs */}
      <div className="flex border-b border-gray-200 bg-white px-2">
        {tabs.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`relative flex-1 py-2.5 text-xs font-medium text-center transition-colors ${tab === t.key ? "text-green-600" : "text-gray-400"}`}>
            {t.label}
            {tab === t.key && <motion.div layoutId="biz-tab" className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-green-600" />}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 space-y-3">

        {/* AI Summary */}
        {summaryParts.length > 0 && (
          <div className="py-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">AI Summary</p>
            <p className="text-xs text-gray-600 leading-relaxed">{summaryParts.join(". ")}.</p>
          </div>
        )}

        {loading ? (
          <div className="space-y-2">{[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded-lg animate-pulse" />)}</div>
        ) : (
          <>
            {/* ── OVERVIEW TAB ── */}
            {tab === "overview" && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="grid grid-cols-2 divide-x divide-gray-100">
                    <div className="px-3 py-3 text-center">
                      <p className="text-[10px] text-gray-400">Receivable</p>
                      <p className="text-sm font-bold text-green-600 mt-0.5">RM{totalReceivable.toFixed(2)}</p>
                    </div>
                    <div className="px-3 py-3 text-center">
                      <p className="text-[10px] text-gray-400">Payable</p>
                      <p className="text-sm font-bold text-red-500 mt-0.5">RM{totalPayable.toFixed(2)}</p>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recent Documents</span>
                  </div>
                  {[...salesDocs, ...purchaseDocs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((doc) => (
                    <DocRowView key={doc.id} doc={doc} formatDate={formatDate} expanded={expandedId === doc.id} onToggle={() => handleExpand(doc)} />
                  ))}
                </div>
              </>
            )}

            {/* ── PURCHASE TAB ── */}
            {tab === "purchase" && (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Purchase Documents</span>
                  <span className="text-[10px] text-gray-400">{purchaseDocs.length} total</span>
                </div>
                {purchaseDocs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">No purchase documents yet</div>
                ) : purchaseDocs.map((doc) => (
                  <DocRowView key={doc.id} doc={doc} formatDate={formatDate} expanded={expandedId === doc.id} onToggle={() => handleExpand(doc)} />
                ))}
              </div>
            )}

            {/* ── SALES TAB ── */}
            {tab === "sales" && (
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sales Documents</span>
                  <span className="text-[10px] text-gray-400">{salesDocs.length} total</span>
                </div>
                {salesDocs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">No sales documents yet</div>
                ) : salesDocs.map((doc) => (
                  <DocRowView key={doc.id} doc={doc} formatDate={formatDate} expanded={expandedId === doc.id} onToggle={() => handleExpand(doc)} />
                ))}
              </div>
            )}

            {/* ── CONTACTS TAB ── */}
            {tab === "contacts" && (
              <>
                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Customers</span>
                  </div>
                  {customers.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400">No customers yet</div>
                  ) : customers.map((c) => (
                    <div key={c.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-xs font-medium text-gray-800">{c.name}</p>
                        {c.phone && <p className="text-[10px] text-gray-400">{c.phone}</p>}
                      </div>
                      {c.total_outstanding_rm > 0 && (
                        <span className="text-xs font-medium text-amber-600">RM{c.total_outstanding_rm.toFixed(2)}</span>
                      )}
                    </div>
                  ))}
                </div>

                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Suppliers</span>
                  </div>
                  {suppliers.length === 0 ? (
                    <div className="px-3 py-4 text-center text-xs text-gray-400">No suppliers yet</div>
                  ) : suppliers.map((s) => (
                    <div key={s.id} className="flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0">
                      <div>
                        <p className="text-xs font-medium text-gray-800">{s.name}</p>
                        {s.phone && <p className="text-[10px] text-gray-400">{s.phone}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ── Document Row Component ──
function DocRowView({ doc, formatDate, expanded, onToggle }: { doc: DocRow; formatDate: (d: string) => string; expanded: boolean; onToggle: () => void }) {
  const badge = STATUS_LABELS[doc.status] || { label: doc.status, cls: "bg-gray-100 text-gray-500" };

  return (
    <div className="border-b border-gray-50 last:border-0">
      <button onClick={onToggle} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/50 transition-colors text-left">
        <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0">{doc.type}</span>
        <div className="flex-1 min-w-0">
          <span className="text-xs text-gray-800 font-medium">{doc.number}</span>
          <span className="text-[10px] text-gray-400 ml-1.5">{doc.contact}</span>
        </div>
        <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDate(doc.date)}</span>
        <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
        <span className="text-xs font-medium text-gray-700 flex-shrink-0 w-16 text-right">RM{doc.total_rm.toFixed(2)}</span>
        <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={12} className="text-gray-300" />
        </motion.div>
      </button>
      <AnimatePresence>
        {expanded && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-50 bg-gray-50/30 px-3 pb-2.5 pt-2 text-xs space-y-1.5">
            <div className="flex justify-between"><span className="text-gray-400">Document</span><span className="text-gray-700">{doc.number}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Date</span><span className="text-gray-700">{new Date(doc.date + "T12:00:00").toLocaleDateString("en-MY", { weekday: "short", day: "numeric", month: "long", year: "numeric" })}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Contact</span><span className="text-gray-700">{doc.contact}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Status</span><span className={`font-medium ${badge.cls} px-1.5 py-0.5 rounded`}>{badge.label}</span></div>
            <div className="flex justify-between"><span className="text-gray-400">Total</span><span className="text-gray-800 font-semibold">RM{doc.total_rm.toFixed(2)}</span></div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
