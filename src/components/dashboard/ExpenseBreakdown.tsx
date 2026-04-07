"use client";

import { useMemo } from "react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

interface ExpenseBreakdownProps {
  summary: { category: string; amount: number }[];
}

const COLORS = [
  "#22c55e", // green
  "#3b82f6", // blue
  "#f59e0b", // amber
  "#ef4444", // red
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#14b8a6", // teal
  "#f97316", // orange
  "#6366f1", // indigo
];

/* eslint-disable @typescript-eslint/no-explicit-any */
function renderLabel(props: any) {
  const { cx, cy, midAngle, innerRadius, outerRadius, category, amount, percent } = props;
  if (percent < 0.05) return null;
  const RADIAN = Math.PI / 180;
  const radius = innerRadius + (outerRadius - innerRadius) * 1.4;
  const x = cx + radius * Math.cos(-midAngle * RADIAN);
  const y = cy + radius * Math.sin(-midAngle * RADIAN);

  return (
    <text
      x={x}
      y={y}
      fill="#374151"
      textAnchor={x > cx ? "start" : "end"}
      dominantBaseline="central"
      fontSize={11}
    >
      {category} (RM{Number(amount).toFixed(0)})
    </text>
  );
}

export default function ExpenseBreakdown({ summary }: ExpenseBreakdownProps) {
  const data = useMemo(
    () => summary.filter((s) => s.amount > 0),
    [summary]
  );

  if (data.length === 0) {
    return (
      <div className="flex h-48 items-center justify-center rounded-2xl border border-dashed border-gray-200 bg-gray-50">
        <p className="text-sm text-gray-400">No expense data to show</p>
      </div>
    );
  }

  return (
    <div>
      <div className="h-56 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="50%"
              cy="50%"
              outerRadius={75}
              innerRadius={35}
              dataKey="amount"
              nameKey="category"
              label={renderLabel}
              labelLine={false}
            >
              {data.map((_, idx) => (
                <Cell
                  key={`cell-${idx}`}
                  fill={COLORS[idx % COLORS.length]}
                  stroke="white"
                  strokeWidth={2}
                />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                fontSize: 12,
                boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
              }}
              formatter={(value: unknown, name: unknown) => [
                `RM ${Number(value).toFixed(2)}`,
                String(name),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>

      {/* Legend below chart */}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1.5 px-2">
        {data.map((item, idx) => (
          <div key={item.category} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
            />
            <span className="text-xs text-gray-600">
              {item.category}{" "}
              <span className="font-medium text-gray-800">
                RM{item.amount.toFixed(0)}
              </span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
