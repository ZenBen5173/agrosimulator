"use client";

import { useMemo } from "react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { FinancialRecord } from "@/types/farm";

interface RevenueChartProps {
  records: FinancialRecord[];
}

interface MonthlyData {
  month: string;
  income: number;
  expenses: number;
}

export default function RevenueChart({ records }: RevenueChartProps) {
  const monthlyData = useMemo(() => {
    if (records.length === 0) return [];

    const map: Record<string, { income: number; expenses: number }> = {};

    for (const r of records) {
      // Extract YYYY-MM from record_date
      const monthKey = r.record_date.slice(0, 7);
      if (!map[monthKey]) {
        map[monthKey] = { income: 0, expenses: 0 };
      }
      if (r.record_type === "income") {
        map[monthKey].income += r.amount;
      } else {
        map[monthKey].expenses += r.amount;
      }
    }

    // Sort by month ascending
    const sorted = Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, data]): MonthlyData => {
        const [year, month] = monthKey.split("-");
        const date = new Date(parseInt(year), parseInt(month) - 1);
        const label = date.toLocaleDateString("en", {
          month: "short",
          year: "2-digit",
        });
        return {
          month: label,
          income: Math.round(data.income * 100) / 100,
          expenses: Math.round(data.expenses * 100) / 100,
        };
      });

    return sorted;
  }, [records]);

  if (monthlyData.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">
          No records yet. Add your first transaction!
        </p>
      </div>
    );
  }

  return (
    <div className="h-64 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart
          data={monthlyData}
          margin={{ top: 8, right: 8, left: -16, bottom: 0 }}
        >
          <defs>
            <linearGradient id="incomeGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
            </linearGradient>
            <linearGradient id="expenseGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
              <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 11, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 12,
              border: "1px solid #e5e7eb",
              fontSize: 12,
              boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
            }}
            formatter={(value: unknown, name: unknown) => [
              `RM ${Number(value).toFixed(2)}`,
              String(name) === "income" ? "Income" : "Expenses",
            ]}
          />
          <Legend
            wrapperStyle={{ fontSize: 12 }}
            formatter={(value: string) =>
              value === "income" ? "Income" : "Expenses"
            }
          />
          <Area
            type="monotone"
            dataKey="income"
            stroke="#22c55e"
            strokeWidth={2}
            fill="url(#incomeGrad)"
          />
          <Area
            type="monotone"
            dataKey="expenses"
            stroke="#ef4444"
            strokeWidth={2}
            fill="url(#expenseGrad)"
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
