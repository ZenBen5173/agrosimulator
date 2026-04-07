"use client";

import { useCallback, useState, use } from "react";
import { useRouter } from "next/navigation";

interface WeekSchedule {
  week: number;
  phase: string;
  tasks: string[];
}

interface PlantingPlan {
  recommended_crop: string;
  reason: string;
  planting_window: string;
  estimated_yield_kg: number;
  estimated_days_to_harvest: number;
  market_note: string | null;
  weekly_schedule: WeekSchedule[];
}

const PHASE_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Land preparation": { bg: "bg-amber-50", border: "border-amber-200", text: "text-amber-800" },
  Planting: { bg: "bg-green-50", border: "border-green-200", text: "text-green-800" },
  "Early growth": { bg: "bg-lime-50", border: "border-lime-200", text: "text-lime-800" },
  "Active growth": { bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800" },
  Maturation: { bg: "bg-yellow-50", border: "border-yellow-200", text: "text-yellow-800" },
  Harvest: { bg: "bg-orange-50", border: "border-orange-200", text: "text-orange-800" },
};

function getPhaseStyle(phase: string) {
  for (const [key, style] of Object.entries(PHASE_COLORS)) {
    if (phase.toLowerCase().includes(key.toLowerCase())) return style;
  }
  return { bg: "bg-gray-50", border: "border-gray-200", text: "text-gray-800" };
}

export default function PlantingPlanPage({
  params,
}: {
  params: Promise<{ plot_id: string }>;
}) {
  const { plot_id } = use(params);
  const router = useRouter();

  const [plan, setPlan] = useState<PlantingPlan | null>(null);
  const [plotLabel, setPlotLabel] = useState("");
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchPlan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/planting/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plot_id }),
      });
      if (!res.ok) throw new Error("Failed to generate plan");
      const data = await res.json();
      setPlan(data.plan);
      setPlotLabel(data.plot_label || "");
    } catch {
      setError("Could not generate a planting plan. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [plot_id]);

  // Fetch on mount
  useState(() => {
    fetchPlan();
  });

  const handleConfirm = useCallback(async () => {
    if (!plan) return;
    setConfirming(true);
    try {
      // Update plot with new crop
      const today = new Date().toISOString().split("T")[0];
      const harvestDate = new Date();
      harvestDate.setDate(harvestDate.getDate() + plan.estimated_days_to_harvest);
      const harvestStr = harvestDate.toISOString().split("T")[0];

      const res = await fetch("/api/planting/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plot_id,
          crop_name: plan.recommended_crop,
          planted_date: today,
          expected_harvest: harvestStr,
        }),
      });

      if (!res.ok) throw new Error("Failed to confirm");
      router.push("/home");
    } catch {
      setConfirming(false);
      setError("Failed to confirm planting. Please try again.");
    }
  }, [plan, plot_id, router]);

  const handleSuggestAnother = useCallback(() => {
    fetchPlan();
  }, [fetchPlan]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-green-50">
        <div className="relative mb-6 flex h-24 w-24 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-green-100 opacity-40" />
          <div className="absolute h-full w-full animate-pulse rounded-full bg-green-100" />
          <span className="relative text-5xl">🌱</span>
        </div>
        <p className="text-lg font-medium text-green-700">
          Planning your next crop...
        </p>
        <p className="mt-2 text-sm text-green-500">
          Analysing soil, weather &amp; market data
        </p>
      </div>
    );
  }

  if (error && !plan) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-green-50 px-6">
        <span className="mb-4 text-5xl">😟</span>
        <p className="mb-4 text-center text-gray-600">{error}</p>
        <button
          onClick={fetchPlan}
          className="rounded-xl bg-green-600 px-6 py-3 font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!plan) return null;

  const isImmediate = plan.planting_window.toLowerCase().includes("within");

  return (
    <div className="min-h-screen bg-green-50 pb-32">
      {/* Header */}
      <div className="bg-white px-5 pt-6 pb-5 shadow-sm">
        <button
          onClick={() => router.back()}
          className="mb-3 text-sm text-gray-500"
        >
          &larr; Back
        </button>
        <p className="text-xs font-medium tracking-wide text-green-600 uppercase">
          Plot {plotLabel} &mdash; Next Crop
        </p>
        <h1 className="mt-1 text-2xl font-bold text-gray-900">
          {plan.recommended_crop}
        </h1>
        <p className="mt-2 text-sm leading-relaxed text-gray-600">
          {plan.reason}
        </p>

        {/* Planting window badge */}
        <div className="mt-3">
          <span
            className={`inline-block rounded-full px-3 py-1 text-xs font-medium ${
              isImmediate
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            🗓️ {plan.planting_window}
          </span>
        </div>

        {/* Market note */}
        {plan.market_note && (
          <div className="mt-3 rounded-lg bg-blue-50 px-3 py-2">
            <p className="text-xs font-medium text-blue-700">
              📈 {plan.market_note}
            </p>
          </div>
        )}

        {/* Stat chips */}
        <div className="mt-4 flex gap-3">
          <div className="flex-1 rounded-xl bg-gray-50 px-4 py-3 text-center">
            <p className="text-lg font-bold text-gray-800">
              ~{plan.estimated_yield_kg}
            </p>
            <p className="text-xs text-gray-500">kg yield</p>
          </div>
          <div className="flex-1 rounded-xl bg-gray-50 px-4 py-3 text-center">
            <p className="text-lg font-bold text-gray-800">
              {plan.estimated_days_to_harvest}
            </p>
            <p className="text-xs text-gray-500">days to harvest</p>
          </div>
        </div>
      </div>

      {/* Weekly Schedule */}
      <div className="px-5 pt-5">
        <h2 className="mb-3 text-sm font-bold text-gray-800">
          Week-by-Week Schedule
        </h2>
        <div className="space-y-3">
          {plan.weekly_schedule.map((week) => {
            const style = getPhaseStyle(week.phase);
            return (
              <div
                key={week.week}
                className={`rounded-xl border p-4 ${style.bg} ${style.border}`}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-bold ${style.text} bg-white/60`}
                  >
                    Week {week.week}
                  </span>
                  <span className={`text-sm font-medium ${style.text}`}>
                    {week.phase}
                  </span>
                </div>
                <ul className="space-y-1">
                  {week.tasks.map((task, i) => (
                    <li
                      key={i}
                      className="flex items-start gap-2 text-sm text-gray-700"
                    >
                      <span className="mt-1 text-xs text-gray-400">•</span>
                      {task}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      </div>

      {/* Error banner */}
      {error && (
        <div className="mx-5 mt-4 rounded-lg bg-red-50 p-3 text-center text-sm text-red-600">
          {error}
        </div>
      )}

      {/* Fixed bottom action buttons */}
      <div className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white px-5 pt-3 pb-safe">
        <div
          className="flex gap-3"
          style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
        >
          <button
            onClick={handleSuggestAnother}
            disabled={loading}
            className="flex-1 rounded-xl border border-gray-300 bg-white py-3.5 text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 disabled:opacity-50"
          >
            Suggest something else
          </button>
          <button
            onClick={handleConfirm}
            disabled={confirming}
            className="flex-1 rounded-xl bg-green-600 py-3.5 text-sm font-semibold text-white shadow-lg transition-colors hover:bg-green-700 disabled:opacity-50"
          >
            {confirming ? "Planting..." : "Plant this crop →"}
          </button>
        </div>
      </div>
    </div>
  );
}
