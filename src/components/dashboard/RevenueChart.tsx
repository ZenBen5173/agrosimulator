"use client";

import { useMemo } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { FinancialRecord } from "@/types/farm";

interface RevenueChartProps {
  records: FinancialRecord[];
}

interface DailyData {
  date: string;
  label: string;
  income: number;
  expenses: number;
  cumIncome: number;
  cumExpenses: number;
}

export default function RevenueChart({ records }: RevenueChartProps) {
  const dailyData = useMemo(() => {
    if (records.length === 0) return [];

    // Find date range (last 30 days or full range, whichever is smaller)
    const sorted = [...records].sort((a, b) => a.record_date.localeCompare(b.record_date));
    const startDate = new Date(sorted[0].record_date + "T00:00:00");
    const endDate = new Date(sorted[sorted.length - 1].record_date + "T00:00:00");

    // Group by date
    const map: Record<string, { income: number; expenses: number }> = {};
    for (const r of records) {
      if (!map[r.record_date]) map[r.record_date] = { income: 0, expenses: 0 };
      if (r.record_type === "income") map[r.record_date].income += r.amount;
      else map[r.record_date].expenses += r.amount;
    }

    // Build daily series with cumulative totals
    const result: DailyData[] = [];
    let cumIncome = 0;
    let cumExpenses = 0;
    const current = new Date(startDate);

    while (current <= endDate) {
      const key = current.toISOString().split("T")[0];
      const day = map[key] || { income: 0, expenses: 0 };
      cumIncome += day.income;
      cumExpenses += day.expenses;

      result.push({
        date: key,
        label: current.toLocaleDateString("en", { day: "numeric", month: "short" }),
        income: Math.round(cumIncome),
        expenses: Math.round(cumExpenses),
        cumIncome: Math.round(cumIncome),
        cumExpenses: Math.round(cumExpenses),
      });

      current.setDate(current.getDate() + 1);
    }

    return result;
  }, [records]);

  if (dailyData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-gray-400">
        No records yet
      </div>
    );
  }

  // Show ~6 tick labels evenly spaced
  const tickInterval = Math.max(1, Math.floor(dailyData.length / 6));

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={dailyData}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 9, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            interval={tickInterval}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`}
          />
          <Tooltip
            contentStyle={{
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              fontSize: 11,
              padding: "6px 10px",
              boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            }}
            formatter={(value: unknown, name: unknown) => [
              `RM${Number(value).toFixed(0)}`,
              String(name) === "income" ? "Total Income" : "Total Expenses",
            ]}
            labelFormatter={(label) => String(label)}
          />
          <Line
            type="monotone"
            dataKey="income"
            stroke="#22c55e"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#22c55e", strokeWidth: 0 }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#ef4444"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "#ef4444", strokeWidth: 0 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
