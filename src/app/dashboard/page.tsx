"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { Plus, ChevronDown, ChevronRight, Camera } from "lucide-react";
import AISummary from "@/components/ui/AISummary";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";
import { createClient } from "@/lib/supabase/client";
import { SkeletonCard, SkeletonLine } from "@/components/ui/Skeleton";
import RevenueChart from "@/components/dashboard/RevenueChart";
import ExpenseBreakdown from "@/components/dashboard/ExpenseBreakdown";
import AddRecordSheet from "@/components/dashboard/AddRecordSheet";
import type { FinancialRecord } from "@/types/farm";

interface FinancialSummary {
  total_income: number;
  total_expenses: number;
  net: number;
  by_category: { category: string; amount: number }[];
}

export default function DashboardPage() {
  const router = useRouter();
  const supabase = createClient();
  const { farm, plots, setFarm, setPlots } = useFarmStore();

  const [records, setRecords] = useState<FinancialRecord[]>([]);
  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [showAllTxns, setShowAllTxns] = useState(false);
  const [chartsExpanded, setChartsExpanded] = useState(false);

  useEffect(() => {
    async function init() {
      if (farm) return;
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.replace("/"); return; }
      const { data: farmRow } = await supabase
        .from("farms")
        .select("id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box")
        .eq("onboarding_done", true).order("created_at", { ascending: false }).limit(1).single();
      if (!farmRow) { router.replace("/onboarding"); return; }
      setFarm(farmRow);
      if (plots.length === 0) {
        const { data: plotRows } = await supabase.from("plots")
          .select("id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url")
          .eq("farm_id", farmRow.id);
        setPlots(plotRows || []);
      }
    }
    init();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchFinancials = useCallback(async () => {
    if (!farm) return;
    try {
      const res = await fetch(`/api/financial?farm_id=${farm.id}&period=all`);
      if (!res.ok) throw new Error("Failed to fetch");
      const data = await res.json();
      setRecords(data.records || []);
      setSummary(data.summary || null);
    } catch (err) {
      console.error("Failed to load financial data:", err);
    } finally {
      setLoading(false);
    }
  }, [farm]);

  useEffect(() => { if (farm) fetchFinancials(); }, [farm, fetchFinancials]);

  const plotOptions = plots.map((p) => ({ id: p.id, label: `${p.label} (${p.crop_name})` }));

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-14">
        <SkeletonLine className="h-5 w-40 mb-4" />
        <SkeletonCard className="h-16 mb-3" />
        <SkeletonCard className="h-32 mb-3" />
        <SkeletonCard className="h-40" />
      </div>
    );
  }

  const recentRecords = showAllTxns ? records : records.slice(0, 8);
  const incomeTotal = summary?.total_income || 0;
  const expenseTotal = summary?.total_expenses || 0;
  const net = summary?.net || 0;

  // AI Summary
  const summaryParts: string[] = [];
  if (summary) {
    summaryParts.push(net >= 0 ? `Net profit RM${net.toFixed(2)} this period` : `Net loss RM${Math.abs(net).toFixed(2)} — expenses exceed income`);
    // Biggest expense category (filter out income categories)
    const expenseRecords = records.filter((r) => r.record_type === "expense");
    const expenseByCategory: Record<string, number> = {};
    for (const r of expenseRecords) expenseByCategory[r.category] = (expenseByCategory[r.category] || 0) + r.amount;
    const topExpenseCategory = Object.entries(expenseByCategory).sort((a, b) => b[1] - a[1])[0];
    if (topExpenseCategory) summaryParts.push(`${topExpenseCategory[0]} is your biggest expense (RM${topExpenseCategory[1].toFixed(0)})`);
    const topIncome = records.filter((r) => r.record_type === "income").sort((a, b) => b.amount - a.amount)[0];
    if (topIncome) summaryParts.push(`top sale: RM${topIncome.amount.toFixed(0)} from ${topIncome.category}`);
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Accounts Overview"
        hideBack
        action={
          <div className="flex gap-1.5">
            <button onClick={() => router.push("/accounts/scan")} className="flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-3 py-1.5 rounded-lg">
              <Camera size={14} /> Scan Doc
            </button>
            <button onClick={() => setSheetOpen(true)} className="flex items-center gap-1 text-xs font-medium text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
              <Plus size={14} /> Manual
            </button>
          </div>
        }
      />

      {/* Sub-navigation */}
      <div className="flex border-b border-gray-200 bg-white px-2 overflow-x-auto no-scrollbar">
        {[
          { label: "Overview", href: "/dashboard", active: true },
          { label: "Documents", href: "/business" },
          { label: "Inventory", href: "/inventory" },
          { label: "Equipment", href: "/equipment" },
        ].map((link) => (
          <button
            key={link.label}
            onClick={() => !link.active && router.push(link.href)}
            className={`flex-shrink-0 py-2.5 px-3 text-xs font-medium transition-colors relative ${
              link.active ? "text-green-600" : "text-gray-400"
            }`}
          >
            {link.label}
            {link.active && <div className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-green-600" />}
          </button>
        ))}
      </div>

      <div className="px-4 pt-3 space-y-3">

        {/* AI Summary */}
        {summaryParts.length > 0 && <AISummary>{`${summaryParts.join(". ")}.`}</AISummary>}

        {/* Summary row */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="grid grid-cols-3 divide-x divide-gray-100">
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400 font-medium">Income</p>
              <p className="text-sm font-bold text-green-600 mt-0.5">RM{incomeTotal.toFixed(2)}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400 font-medium">Expenses</p>
              <p className="text-sm font-bold text-red-500 mt-0.5">RM{expenseTotal.toFixed(2)}</p>
            </div>
            <div className="px-3 py-3 text-center">
              <p className="text-[10px] text-gray-400 font-medium">Net</p>
              <p className={`text-sm font-bold mt-0.5 ${net >= 0 ? "text-green-600" : "text-red-500"}`}>
                {net >= 0 ? "+" : "-"}RM{Math.abs(net).toFixed(2)}
              </p>
            </div>
          </div>
        </div>

        {/* Charts (collapsible) */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <button onClick={() => setChartsExpanded(!chartsExpanded)} className="w-full px-3 py-2.5 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Charts</span>
            <motion.div animate={{ rotate: chartsExpanded ? 180 : 0 }} transition={{ duration: 0.15 }}>
              <ChevronDown size={14} className="text-gray-300" />
            </motion.div>
          </button>
          <AnimatePresence>
            {chartsExpanded && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="border-t border-gray-100">
                <div className="p-3">
                  <p className="text-xs font-medium text-gray-700 mb-2">Revenue Overview</p>
                  <RevenueChart records={records} />
                </div>
                <div className="p-3 border-t border-gray-100">
                  <p className="text-xs font-medium text-gray-700 mb-2">Expense Breakdown</p>
                  <ExpenseBreakdown summary={summary?.by_category || []} />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Transactions table */}
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Transactions</span>
            <span className="text-[10px] text-gray-400">{records.length} total</span>
          </div>

          {records.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-gray-400">
              No transactions yet. Tap &quot;Add Record&quot; to start tracking.
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 px-3 py-1.5 border-b border-gray-50 text-[10px] text-gray-400 font-medium">
                <span className="w-12">Date</span>
                <span className="flex-1">Description</span>
                <span>Category</span>
                <span className="w-16 text-right">Amount</span>
                <span className="w-3" />
              </div>
              {recentRecords.map((r) => {
                const isIncome = r.record_type === "income";
                return (
                  <button key={r.id} onClick={() => router.push(`/dashboard/${r.id}`)} className="w-full flex items-center gap-2 px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 transition-colors text-left">
                    <span className="text-[10px] text-gray-400 w-12 flex-shrink-0">{formatDate(r.record_date)}</span>
                    <div className="flex-1 min-w-0">
                      <span className="text-xs text-gray-800">{r.description || r.category}</span>
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded flex-shrink-0 ${isIncome ? "bg-green-50 text-green-600" : "bg-red-50 text-red-500"}`}>
                      {r.category}
                    </span>
                    <span className={`text-xs font-semibold flex-shrink-0 w-16 text-right ${isIncome ? "text-green-600" : "text-red-500"}`}>
                      {isIncome ? "+" : "-"}RM{r.amount.toFixed(2)}
                    </span>
                    <ChevronRight size={12} className="text-gray-300 flex-shrink-0" />
                  </button>
                );
              })}
              {records.length > 8 && (
                <button onClick={() => setShowAllTxns(!showAllTxns)} className="w-full px-3 py-2 text-[11px] text-green-600 font-medium text-left border-t border-gray-100 hover:bg-gray-50">
                  {showAllTxns ? "Show less" : `View all ${records.length} transactions`}
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Add Record Sheet */}
      {farm && (
        <AddRecordSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          farmId={farm.id}
          plots={plotOptions}
          onAdded={fetchFinancials}
        />
      )}
    </div>
  );
}
