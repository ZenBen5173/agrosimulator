"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronRight, ChevronDown, Plus } from "lucide-react";
import { PieChart, Pie, Cell, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
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
  const [chartsOpen, setChartsOpen] = useState(false);

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

  const totalReceivable = salesDocs.filter((d) => d.type === "INV" && d.status !== "paid").reduce((s, d) => s + d.total_rm, 0);
  const totalPayable = purchaseDocs.filter((d) => d.type === "Bill" && d.status !== "paid").reduce((s, d) => s + d.total_rm, 0);

  // AI Summary
  const summaryParts: string[] = [];
  if (totalReceivable > 0) summaryParts.push(`RM${totalReceivable.toFixed(2)} outstanding from customers`);
  if (totalPayable > 0) summaryParts.push(`RM${totalPayable.toFixed(2)} owed to suppliers`);
  if (salesDocs.length === 0 && purchaseDocs.length === 0) summaryParts.push("No business documents yet");
  const overdueInv = salesDocs.filter((d) => d.type === "INV" && d.status === "unpaid");
  if (overdueInv.length > 0) summaryParts.push(`${overdueInv.length} unpaid invoice${overdueInv.length > 1 ? "s" : ""}`);

  // Chart data
  const CHART_COLORS = ["#22c55e", "#3b82f6", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"];

  // Purchase breakdown by status
  const purchaseByStatus = purchaseDocs.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + d.total_rm;
    return acc;
  }, {} as Record<string, number>);
  const purchasePieData = Object.entries(purchaseByStatus).map(([name, value]) => ({ name, value: Math.round(value) }));

  // Sales breakdown by status
  const salesByStatus = salesDocs.reduce((acc, d) => {
    acc[d.status] = (acc[d.status] || 0) + d.total_rm;
    return acc;
  }, {} as Record<string, number>);
  const salesPieData = Object.entries(salesByStatus).map(([name, value]) => ({ name, value: Math.round(value) }));

  // Monthly sales + purchase trend
  const monthlyTrend = (() => {
    const map: Record<string, { sales: number; purchases: number }> = {};
    for (const d of salesDocs) {
      const m = d.date.slice(0, 7);
      if (!map[m]) map[m] = { sales: 0, purchases: 0 };
      map[m].sales += d.total_rm;
    }
    for (const d of purchaseDocs) {
      const m = d.date.slice(0, 7);
      if (!map[m]) map[m] = { sales: 0, purchases: 0 };
      map[m].purchases += d.total_rm;
    }
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => ({
      month: new Date(k + "-01T12:00:00").toLocaleDateString("en", { month: "short" }),
      sales: Math.round(v.sales),
      purchases: Math.round(v.purchases),
    }));
  })();

  // Overview totals
  const totalSales = salesDocs.reduce((s, d) => s + d.total_rm, 0);
  const totalPurchases = purchaseDocs.reduce((s, d) => s + d.total_rm, 0);
  const overviewPieData = [
    { name: "Sales", value: Math.round(totalSales) },
    { name: "Purchases", value: Math.round(totalPurchases) },
  ];

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Overview" },
    { key: "purchase", label: "Purchase" },
    { key: "sales", label: "Sales" },
    { key: "contacts", label: "Contacts" },
  ];

  const formatDate = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-MY", { day: "numeric", month: "short" });

  const DOC_TYPE_URL: Record<string, string> = {
    QT: "quotation", SO: "sales_order", DO: "delivery_order", INV: "sales_invoice",
    RFQ: "rfq", PO: "purchase_order", GRN: "grn", Bill: "purchase_invoice",
  };
  const viewDoc = (doc: DocRow) => router.push(`/business/${DOC_TYPE_URL[doc.type] || doc.type}/${doc.id}`);

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader title="Documents" breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Documents" }]} />

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

                {/* Charts */}
                <ChartDropdown title="Statistics" open={chartsOpen} onToggle={() => setChartsOpen(!chartsOpen)}>
                  <div className="grid grid-cols-2 gap-3 mb-3">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Sales vs Purchases</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={overviewPieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                              {overviewPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i]} />)}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `RM${v}`} contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex justify-center gap-3 text-[9px]">
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" />Sales</span>
                        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" />Purchases</span>
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Monthly Trend</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} formatter={(v: unknown) => `RM${v}`} />
                            <Line type="monotone" dataKey="sales" stroke="#22c55e" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="purchases" stroke="#ef4444" strokeWidth={2} dot={false} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </ChartDropdown>

                <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                  <div className="px-3 py-2 border-b border-gray-100">
                    <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Recent Documents</span>
                  </div>
                  {[...salesDocs, ...purchaseDocs].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((doc) => (
                    <DocRowView key={doc.id} doc={doc} formatDate={formatDate} onView={() => viewDoc(doc)} />
                  ))}
                </div>
              </>
            )}

            {/* ── PURCHASE TAB ── */}
            {tab === "purchase" && (
              <>
              {purchasePieData.length > 0 && (
                <ChartDropdown title="Purchase Statistics" open={chartsOpen} onToggle={() => setChartsOpen(!chartsOpen)}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">By Status</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={purchasePieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                              {purchasePieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `RM${v}`} contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 text-[9px]">
                        {purchasePieData.map((d, i) => (
                          <span key={d.name} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Monthly Spend</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} formatter={(v: unknown) => `RM${v}`} />
                            <Line type="monotone" dataKey="purchases" stroke="#ef4444" strokeWidth={2} dot={{ r: 2, fill: "#ef4444" }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </ChartDropdown>
              )}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Purchase Documents</span>
                  <span className="text-[10px] text-gray-400">{purchaseDocs.length} total</span>
                </div>
                {purchaseDocs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">No purchase documents yet</div>
                ) : purchaseDocs.map((doc) => (
                  <DocRowView key={doc.id} doc={doc} formatDate={formatDate} onView={() => viewDoc(doc)} />
                ))}
              </div>
              </>
            )}

            {/* ── SALES TAB ── */}
            {tab === "sales" && (
              <>
              {salesPieData.length > 0 && (
                <ChartDropdown title="Sales Statistics" open={chartsOpen} onToggle={() => setChartsOpen(!chartsOpen)}>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">By Status</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={salesPieData} cx="50%" cy="50%" innerRadius={25} outerRadius={45} dataKey="value" strokeWidth={0}>
                              {salesPieData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v: unknown) => `RM${v}`} contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} />
                          </PieChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="flex flex-wrap justify-center gap-2 text-[9px]">
                        {salesPieData.map((d, i) => (
                          <span key={d.name} className="flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />{d.name}
                          </span>
                        ))}
                      </div>
                    </div>
                    <div>
                      <p className="text-[10px] text-gray-400 mb-1 text-center">Monthly Revenue</p>
                      <div className="h-28">
                        <ResponsiveContainer width="100%" height="100%">
                          <LineChart data={monthlyTrend} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
                            <XAxis dataKey="month" tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 9, fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ fontSize: 10, borderRadius: 6, padding: "4px 8px" }} formatter={(v: unknown) => `RM${v}`} />
                            <Line type="monotone" dataKey="sales" stroke="#22c55e" strokeWidth={2} dot={{ r: 2, fill: "#22c55e" }} />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  </div>
                </ChartDropdown>
              )}
              <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
                <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Sales Documents</span>
                  <span className="text-[10px] text-gray-400">{salesDocs.length} total</span>
                </div>
                {salesDocs.length === 0 ? (
                  <div className="px-3 py-6 text-center text-xs text-gray-400">No sales documents yet</div>
                ) : salesDocs.map((doc) => (
                  <DocRowView key={doc.id} doc={doc} formatDate={formatDate} onView={() => viewDoc(doc)} />
                ))}
              </div>
              </>
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
function DocRowView({ doc, formatDate, onView }: { doc: DocRow; formatDate: (d: string) => string; onView: () => void }) {
  const badge = STATUS_LABELS[doc.status] || { label: doc.status, cls: "bg-gray-100 text-gray-500" };

  return (
    <button onClick={onView} className="w-full flex items-center gap-2 px-3 py-2.5 hover:bg-gray-50/50 transition-colors text-left border-b border-gray-50 last:border-0">
      <span className="text-[9px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded w-8 text-center flex-shrink-0">{doc.type}</span>
      <div className="flex-1 min-w-0">
        <span className="text-xs text-gray-800 font-medium">{doc.number}</span>
        <span className="text-[10px] text-gray-400 ml-1.5">{doc.contact}</span>
      </div>
      <span className="text-[10px] text-gray-400 flex-shrink-0">{formatDate(doc.date)}</span>
      <span className={`text-[9px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 ${badge.cls}`}>{badge.label}</span>
      <span className="text-xs font-medium text-gray-700 flex-shrink-0 w-16 text-right">RM{doc.total_rm.toFixed(2)}</span>
      <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
    </button>
  );
}

// ── Chart Dropdown Component ──
function ChartDropdown({ title, open, onToggle, children }: { title: string; open: boolean; onToggle: () => void; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
      <button onClick={onToggle} className="w-full px-3 py-2.5 flex items-center justify-between">
        <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">{title}</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown size={14} className="text-gray-300" />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
            className="border-t border-gray-100 px-3 py-3">
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
