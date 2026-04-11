"use client";

import { useState, useEffect } from "react";
import { useParams } from "next/navigation";
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

export default function TransactionDetailPage() {
  const params = useParams();
  const recordId = params.id as string;
  const [record, setRecord] = useState<Record | null>(null);
  const [plotLabel, setPlotLabel] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetch() {
      const supabase = createClient();
      const { data } = await supabase.from("financial_records").select("*").eq("id", recordId).single();
      if (data) {
        setRecord(data);
        if (data.plot_id) {
          const { data: plot } = await supabase.from("plots").select("label, crop_name").eq("id", data.plot_id).single();
          if (plot) setPlotLabel(`${plot.label} (${plot.crop_name})`);
        }
      }
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
      <PageHeader
        title="Transaction"
        breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: record.category }]}
      />

      <div className="px-4 pt-3 space-y-3">

        {/* Amount header */}
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
