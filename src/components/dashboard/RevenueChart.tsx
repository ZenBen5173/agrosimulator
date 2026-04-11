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
      const monthKey = r.record_date.slice(0, 7);
      if (!map[monthKey]) map[monthKey] = { income: 0, expenses: 0 };
      if (r.record_type === "income") map[monthKey].income += r.amount;
      else map[monthKey].expenses += r.amount;
    }

    return Object.entries(map)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([monthKey, data]): MonthlyData => {
        const [year, month] = monthKey.split("-");
        const date = new Date(parseInt(year), parseInt(month) - 1);
        return {
          month: date.toLocaleDateString("en", { month: "short" }),
          income: Math.round(data.income),
          expenses: Math.round(data.expenses),
        };
      });
  }, [records]);

  if (monthlyData.length === 0) {
    return (
      <div className="flex h-32 items-center justify-center text-xs text-gray-400">
        No records yet
      </div>
    );
  }

  return (
    <div className="h-48 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={monthlyData}
          margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
          <XAxis
            dataKey="month"
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            tick={{ fontSize: 10, fill: "#9ca3af" }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : `${v}`}
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
              String(name) === "income" ? "Income" : "Expenses",
            ]}
          />
          <Line
            type="monotone"
            dataKey="income"
            stroke="#22c55e"
            strokeWidth={2}
            dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="#ef4444"
            strokeWidth={2}
            dot={{ r: 3, fill: "#ef4444", strokeWidth: 0 }}
            activeDot={{ r: 5 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
