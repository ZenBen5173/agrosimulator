"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { PlotData } from "@/types/farm";

interface PlotBottomSheetProps {
  plot: PlotData | null;
  onClose: () => void;
  warningReason?: string;
  onHarvest?: (plotId: string) => void;
}

const STAGE_LABELS: Record<string, { label: string; color: string }> = {
  seedling: { label: "Seedling", color: "bg-lime-100 text-lime-700" },
  growing: { label: "Growing", color: "bg-green-100 text-green-700" },
  mature: { label: "Mature", color: "bg-emerald-100 text-emerald-700" },
  harvest_ready: {
    label: "Harvest Ready",
    color: "bg-amber-100 text-amber-700",
  },
  harvested: { label: "Harvested", color: "bg-gray-100 text-gray-600" },
};

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export default function PlotBottomSheet({
  plot,
  onClose,
  warningReason,
  onHarvest,
}: PlotBottomSheetProps) {
  const router = useRouter();
  const sheetRef = useRef<HTMLDivElement>(null);
  const [harvesting, setHarvesting] = useState(false);

  // Close on escape
  useEffect(() => {
    if (!plot) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [plot, onClose]);

  // Touch dismiss — drag down
  const startYRef = useRef(0);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    startYRef.current = e.touches[0].clientY;
  }, []);

  const onTouchEnd = useCallback(
    (e: React.TouchEvent) => {
      const delta = e.changedTouches[0].clientY - startYRef.current;
      if (delta > 80) onClose();
    },
    [onClose]
  );

  if (!plot) return null;

  const today = new Date().toISOString().split("T")[0];
  const plantedDays = plot.planted_date
    ? daysBetween(plot.planted_date, today)
    : null;
  const harvestDays =
    plot.expected_harvest && plot.planted_date
      ? daysBetween(plot.planted_date, plot.expected_harvest)
      : null;
  const progress =
    plantedDays !== null && harvestDays && harvestDays > 0
      ? Math.min(1, Math.max(0, plantedDays / harvestDays))
      : null;

  const stageInfo = STAGE_LABELS[plot.growth_stage] || {
    label: plot.growth_stage,
    color: "bg-gray-100 text-gray-600",
  };

  const warningColor =
    plot.warning_level === "red"
      ? "bg-red-100 text-red-700"
      : plot.warning_level === "orange"
        ? "bg-orange-100 text-orange-700"
        : plot.warning_level === "yellow"
          ? "bg-yellow-100 text-yellow-700"
          : null;

  return (
    <>
      {/* Dim overlay */}
      <div
        className="fixed inset-0 z-40 bg-black/40 transition-opacity"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        ref={sheetRef}
        className="fixed right-0 bottom-0 left-0 z-50 rounded-t-2xl bg-white px-5 pt-3 pb-6 shadow-[0_-8px_30px_rgba(0,0,0,0.15)]"
        style={{
          paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
          animation: "slideUp 0.25s ease-out",
        }}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {/* Drag handle */}
        <div className="mb-3 flex justify-center">
          <div className="h-1 w-10 rounded-full bg-gray-300" />
        </div>

        {/* Plot header */}
        <div className="mb-4 flex items-center gap-3">
          <span
            className="h-6 w-6 rounded-full border-2 border-white shadow"
            style={{ backgroundColor: plot.colour_hex }}
          />
          <div className="flex-1">
            <h2 className="text-lg font-bold text-gray-900">
              {plot.label} — {plot.crop_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Badges row */}
        <div className="mb-4 flex flex-wrap gap-2">
          <span
            className={`rounded-full px-3 py-1 text-xs font-medium ${stageInfo.color}`}
          >
            {stageInfo.label}
          </span>
          {warningColor && (
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${warningColor}`}
            >
              ⚠ {plot.warning_level}
            </span>
          )}
        </div>

        {/* Warning reason */}
        {warningReason && plot.warning_level !== "none" && (
          <div
            className={`mb-4 rounded-lg p-3 ${
              plot.warning_level === "red"
                ? "bg-red-50 border border-red-200"
                : plot.warning_level === "orange"
                  ? "bg-orange-50 border border-orange-200"
                  : "bg-yellow-50 border border-yellow-200"
            }`}
          >
            <p
              className={`text-sm ${
                plot.warning_level === "red"
                  ? "text-red-700"
                  : plot.warning_level === "orange"
                    ? "text-orange-700"
                    : "text-yellow-700"
              }`}
            >
              ⚠ {warningReason}
            </p>
          </div>
        )}

        {/* Inspection CTA for high-risk plots */}
        {(plot.warning_level === "orange" || plot.warning_level === "red") && (
          <button
            onClick={() => {
              onClose();
              router.push(`/inspection?plot_id=${plot.id}`);
            }}
            className={`mb-4 w-full rounded-xl py-3 text-center text-sm font-semibold text-white ${
              plot.warning_level === "red"
                ? "bg-red-600 hover:bg-red-700"
                : "bg-orange-500 hover:bg-orange-600"
            }`}
          >
            Start Inspection &rarr;
          </button>
        )}

        {/* Stats */}
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Days since planted</p>
            <p className="text-xl font-bold text-gray-800">
              {plantedDays !== null ? plantedDays : "—"}
            </p>
          </div>
          <div className="rounded-lg bg-gray-50 p-3">
            <p className="text-xs text-gray-500">Days to harvest</p>
            <p className="text-xl font-bold text-gray-800">
              {harvestDays !== null && plantedDays !== null
                ? Math.max(0, harvestDays - plantedDays)
                : "—"}
            </p>
          </div>
        </div>

        {/* Progress bar */}
        {progress !== null && plot.growth_stage !== "harvested" && (
          <div className="mb-4">
            <div className="mb-1 flex justify-between text-xs text-gray-500">
              <span>Planted</span>
              <span>Harvest</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-gray-200">
              <div
                className="h-full rounded-full bg-green-500 transition-all"
                style={{ width: `${progress * 100}%` }}
              />
            </div>
            <p className="mt-1 text-center text-xs text-gray-400">
              {Math.round(progress * 100)}% complete
            </p>
          </div>
        )}

        {/* Mark as Harvested CTA for harvest_ready plots */}
        {(plot.growth_stage === "harvest_ready" || plot.growth_stage === "mature") && (
          <button
            onClick={async () => {
              setHarvesting(true);
              try {
                await onHarvest?.(plot.id);
              } finally {
                setHarvesting(false);
              }
            }}
            disabled={harvesting}
            className="mb-3 w-full rounded-xl bg-amber-500 py-3 text-center text-sm font-semibold text-white transition-colors hover:bg-amber-600 disabled:opacity-50"
          >
            {harvesting ? "Harvesting..." : "🌾 Mark as Harvested"}
          </button>
        )}

        {/* Plan next crop CTA for harvested plots */}
        {plot.growth_stage === "harvested" && (
          <button
            onClick={() => {
              onClose();
              router.push(`/planting/${plot.id}`);
            }}
            className="mb-3 w-full rounded-xl bg-green-600 py-3 text-center text-sm font-semibold text-white shadow-lg transition-colors hover:bg-green-700"
          >
            🌱 Plan next crop &rarr;
          </button>
        )}
      </div>

      {/* Keyframe animation */}
      <style jsx>{`
        @keyframes slideUp {
          from {
            transform: translateY(100%);
          }
          to {
            transform: translateY(0);
          }
        }
      `}</style>
    </>
  );
}
