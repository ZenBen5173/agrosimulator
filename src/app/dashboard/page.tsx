"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  TrendingUp,
  TrendingDown,
  Wallet,
  Plus,
  ArrowUpCircle,
  ArrowDownCircle,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";
import { createClient } from "@/lib/supabase/client";
import Card from "@/components/ui/Card";
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

  // Load farm if not in store (direct navigation to /dashboard)
  useEffect(() => {
    async function init() {
      if (farm) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        router.replace("/");
        return;
      }

      const { data: farmRow } = await supabase
        .from("farms")
        .select(
          "id, name, area_acres, grid_size, soil_type, water_source, polygon_geojson, bounding_box"
        )
        .eq("onboarding_done", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      if (!farmRow) {
        router.replace("/onboarding");
        return;
      }

      setFarm(farmRow);

      // Also load plots if empty
      if (plots.length === 0) {
        const { data: plotRows } = await supabase
          .from("plots")
          .select(
            "id, label, crop_name, growth_stage, warning_level, colour_hex, planted_date, expected_harvest, photo_url"
          )
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

  useEffect(() => {
    if (farm) {
      fetchFinancials();
    }
  }, [farm, fetchFinancials]);

  const plotOptions = plots.map((p) => ({
    id: p.id,
    label: `${p.label} (${p.crop_name})`,
  }));

  const formatRM = (val: number) => {
    const abs = Math.abs(val);
    if (abs >= 1000) {
      return `RM ${(val / 1000).toFixed(1)}k`;
    }
    return `RM ${val.toFixed(2)}`;
  };

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr + "T12:00:00");
    return d.toLocaleDateString("en-MY", { day: "numeric", month: "short" });
  };

  // Loading skeleton
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
        <SkeletonLine className="mb-6 h-6 w-40" />
        <div className="mb-5 grid grid-cols-3 gap-3">
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
          <SkeletonCard className="h-24" />
        </div>
        <SkeletonCard className="mb-5 h-64" />
        <SkeletonCard className="mb-5 h-56" />
        <SkeletonCard className="h-40" />
      </div>
    );
  }

  const recentRecords = records.slice(0, 10);

  return (
    <div className="min-h-screen bg-gray-50 px-4 pt-6 pb-24">
      {/* Page Title */}
      <h1 className="mb-5 text-xl font-bold text-gray-900">
        Financial Dashboard
      </h1>

      {/* Summary Cards */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {/* Total Income */}
        <Card variant="default" className="p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <TrendingUp size={14} className="text-green-500" />
            <span className="text-[10px] font-medium text-gray-500">
              Income
            </span>
          </div>
          <p className="text-sm font-bold text-green-600">
            {summary ? formatRM(summary.total_income) : "RM 0.00"}
          </p>
        </Card>

        {/* Total Expenses */}
        <Card variant="default" className="p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <TrendingDown size={14} className="text-red-500" />
            <span className="text-[10px] font-medium text-gray-500">
              Expenses
            </span>
          </div>
          <p className="text-sm font-bold text-red-600">
            {summary ? formatRM(summary.total_expenses) : "RM 0.00"}
          </p>
        </Card>

        {/* Net Profit/Loss */}
        <Card variant="default" className="p-3">
          <div className="mb-1.5 flex items-center gap-1.5">
            <Wallet size={14} className="text-gray-500" />
            <span className="text-[10px] font-medium text-gray-500">
              Net
            </span>
          </div>
          <p
            className={`text-sm font-bold ${
              summary && summary.net >= 0 ? "text-green-600" : "text-red-600"
            }`}
          >
            {summary ? formatRM(summary.net) : "RM 0.00"}
          </p>
        </Card>
      </div>

      {/* Revenue Chart */}
      <Card variant="default" className="mb-5 p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-800">
          Revenue Overview
        </h3>
        <RevenueChart records={records} />
      </Card>

      {/* Expense Breakdown */}
      <Card variant="default" className="mb-5 p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-800">
          Expense Breakdown
        </h3>
        <ExpenseBreakdown summary={summary?.by_category || []} />
      </Card>

      {/* Recent Transactions */}
      <Card variant="default" className="mb-5 p-4">
        <h3 className="mb-3 text-sm font-bold text-gray-800">
          Recent Transactions
        </h3>
        {recentRecords.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 p-6 text-center">
            <p className="text-sm text-gray-400">
              No transactions yet. Tap + to add your first record.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {recentRecords.map((record) => {
              const isIncome = record.record_type === "income";
              return (
                <motion.div
                  key={record.id}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-center gap-3 rounded-xl bg-gray-50 px-3 py-2.5"
                >
                  {/* Icon */}
                  <div
                    className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full ${
                      isIncome ? "bg-green-100" : "bg-red-100"
                    }`}
                  >
                    {isIncome ? (
                      <ArrowUpCircle size={16} className="text-green-600" />
                    ) : (
                      <ArrowDownCircle size={16} className="text-red-500" />
                    )}
                  </div>

                  {/* Details */}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-gray-800">
                      {record.category}
                    </p>
                    {record.description && (
                      <p className="truncate text-xs text-gray-400">
                        {record.description}
                      </p>
                    )}
                  </div>

                  {/* Amount + date */}
                  <div className="flex-shrink-0 text-right">
                    <p
                      className={`text-sm font-semibold ${
                        isIncome ? "text-green-600" : "text-red-500"
                      }`}
                    >
                      {isIncome ? "+" : "-"}RM{record.amount.toFixed(2)}
                    </p>
                    <p className="text-[10px] text-gray-400">
                      {formatDate(record.record_date)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </Card>

      {/* FAB - Floating Action Button */}
      <motion.button
        whileTap={{ scale: 0.9 }}
        onClick={() => setSheetOpen(true)}
        className="fixed right-5 bottom-20 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-green-600 text-white shadow-lg shadow-green-600/30"
      >
        <Plus size={24} />
      </motion.button>

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
