"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Search,
  Droplets,
  Sprout,
  Clock,
  Scissors,
  AlertTriangle,
} from "lucide-react";
import ProgressRing from "@/components/ui/ProgressRing";
import type { PlotData } from "@/types/farm";

interface PlotBottomSheetProps {
  plot: PlotData | null;
  onClose: () => void;
  warningReason?: string;
  onHarvest?: (plotId: string) => void;
}

const STAGE_LABELS: Record<string, { label: string; color: string; ringColor: string }> = {
  seedling: { label: "Seedling", color: "bg-lime-100 text-lime-700", ringColor: "#84cc16" },
  growing: { label: "Growing", color: "bg-green-100 text-green-700", ringColor: "#22c55e" },
  mature: { label: "Mature", color: "bg-emerald-100 text-emerald-700", ringColor: "#10b981" },
  harvest_ready: {
    label: "Harvest Ready",
    color: "bg-amber-100 text-amber-700",
    ringColor: "#f59e0b",
  },
  harvested: { label: "Harvested", color: "bg-gray-100 text-gray-600", ringColor: "#9ca3af" },
};

function daysBetween(a: string, b: string): number {
  const d1 = new Date(a);
  const d2 = new Date(b);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

const CROP_EMOJI: Record<string, string> = {
  paddy: "🌾",
  rice: "🌾",
  chilli: "🌶️",
  tomato: "🍅",
  corn: "🌽",
  banana: "🍌",
  kangkung: "🥬",
  sweet_potato: "🍠",
  sweetpotato: "🍠",
};

export default function PlotBottomSheet({
  plot,
  onClose,
  warningReason,
  onHarvest,
}: PlotBottomSheetProps) {
  const router = useRouter();
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

  // Touch dismiss
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

  const today = plot ? new Date().toISOString().split("T")[0] : "";
  const plantedDays =
    plot?.planted_date ? daysBetween(plot.planted_date, today) : null;
  const harvestDays =
    plot?.expected_harvest && plot?.planted_date
      ? daysBetween(plot.planted_date, plot.expected_harvest)
      : null;
  const progress =
    plantedDays !== null && harvestDays && harvestDays > 0
      ? Math.min(1, Math.max(0, plantedDays / harvestDays))
      : null;

  const stageInfo = plot
    ? STAGE_LABELS[plot.growth_stage] || {
        label: plot.growth_stage,
        color: "bg-gray-100 text-gray-600",
        ringColor: "#9ca3af",
      }
    : null;

  const warningColor = plot
    ? plot.warning_level === "red"
      ? "border-red-200 bg-red-50"
      : plot.warning_level === "orange"
        ? "border-orange-200 bg-orange-50"
        : plot.warning_level === "yellow"
          ? "border-yellow-200 bg-yellow-50"
          : null
    : null;

  const cropEmoji = plot
    ? CROP_EMOJI[plot.crop_name.toLowerCase().replace(/\s/g, "_")] || "🌿"
    : "🌿";

  return (
    <AnimatePresence>
      {plot && stageInfo && (
        <>
          {/* Dim overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40"
            onClick={onClose}
          />

          {/* Sheet */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 300 }}
            className="fixed right-0 bottom-0 left-0 z-50 rounded-t-3xl bg-white/95 backdrop-blur-xl px-5 pt-3 pb-6 shadow-[0_-8px_40px_rgba(0,0,0,0.12)]"
            style={{ paddingBottom: "calc(24px + env(safe-area-inset-bottom))" }}
            onTouchStart={onTouchStart}
            onTouchEnd={onTouchEnd}
          >
            {/* Drag handle */}
            <div className="mb-3 flex justify-center">
              <div className="h-1 w-10 rounded-full bg-gray-300" />
            </div>

            {/* Header: crop emoji + ring + info */}
            <div className="mb-4 flex items-center gap-4">
              {/* Progress ring with crop emoji */}
              <div className="relative">
                <ProgressRing
                  progress={progress ?? 0}
                  size={64}
                  strokeWidth={5}
                  color={stageInfo.ringColor}
                >
                  <span className="text-2xl">{cropEmoji}</span>
                </ProgressRing>
              </div>

              <div className="flex-1 min-w-0">
                <h2 className="text-lg font-bold text-gray-900">
                  {plot.label} — {plot.crop_name}
                </h2>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${stageInfo.color}`}
                  >
                    {stageInfo.label}
                  </span>
                  {warningColor && (
                    <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-[11px] font-medium text-red-700">
                      ⚠ {plot.warning_level}
                    </span>
                  )}
                  {progress !== null && (
                    <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-medium text-gray-600">
                      {Math.round(progress * 100)}%
                    </span>
                  )}
                </div>
              </div>

              <button
                onClick={onClose}
                className="rounded-full bg-gray-100 p-2 text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Warning alert */}
            {warningReason && plot.warning_level !== "none" && (
              <div
                className={`mb-4 flex items-start gap-2.5 rounded-xl border p-3 ${warningColor}`}
              >
                <AlertTriangle
                  size={16}
                  className={
                    plot.warning_level === "red"
                      ? "text-red-600 mt-0.5"
                      : "text-orange-600 mt-0.5"
                  }
                />
                <p
                  className={`text-sm ${
                    plot.warning_level === "red"
                      ? "text-red-700"
                      : plot.warning_level === "orange"
                        ? "text-orange-700"
                        : "text-yellow-700"
                  }`}
                >
                  {warningReason}
                </p>
              </div>
            )}

            {/* Stats row */}
            <div className="mb-4 grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Days Planted
                </p>
                <p className="text-xl font-bold text-gray-800 mt-0.5">
                  {plantedDays !== null ? plantedDays : "—"}
                </p>
              </div>
              <div className="rounded-xl bg-gray-50 p-3 text-center">
                <p className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">
                  Days to Harvest
                </p>
                <p className="text-xl font-bold text-gray-800 mt-0.5">
                  {harvestDays !== null && plantedDays !== null
                    ? Math.max(0, harvestDays - plantedDays)
                    : "—"}
                </p>
              </div>
            </div>

            {/* Quick action buttons */}
            <div className="mb-4 grid grid-cols-4 gap-2">
              <button
                onClick={() => {
                  onClose();
                  router.push(`/inspection?plot_id=${plot.id}`);
                }}
                className="flex flex-col items-center gap-1 rounded-xl bg-green-50 p-2.5 transition-colors hover:bg-green-100 active:scale-95"
              >
                <Search size={18} className="text-green-600" />
                <span className="text-[10px] font-medium text-green-700">
                  Inspect
                </span>
              </button>
              <button className="flex flex-col items-center gap-1 rounded-xl bg-blue-50 p-2.5 transition-colors hover:bg-blue-100 active:scale-95">
                <Droplets size={18} className="text-blue-600" />
                <span className="text-[10px] font-medium text-blue-700">
                  Water
                </span>
              </button>
              <button className="flex flex-col items-center gap-1 rounded-xl bg-lime-50 p-2.5 transition-colors hover:bg-lime-100 active:scale-95">
                <Sprout size={18} className="text-lime-600" />
                <span className="text-[10px] font-medium text-lime-700">
                  Fertilize
                </span>
              </button>
              <button className="flex flex-col items-center gap-1 rounded-xl bg-gray-50 p-2.5 transition-colors hover:bg-gray-100 active:scale-95">
                <Clock size={18} className="text-gray-600" />
                <span className="text-[10px] font-medium text-gray-700">
                  History
                </span>
              </button>
            </div>

            {/* Inspection CTA for high-risk plots */}
            {(plot.warning_level === "orange" ||
              plot.warning_level === "red") && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  onClose();
                  router.push(`/inspection?plot_id=${plot.id}`);
                }}
                className={`mb-3 w-full rounded-xl py-3.5 text-center text-sm font-semibold text-white shadow-sm ${
                  plot.warning_level === "red"
                    ? "bg-red-600"
                    : "bg-orange-500"
                }`}
              >
                <Search size={16} className="inline mr-1.5 -mt-0.5" />
                Start Inspection
              </motion.button>
            )}

            {/* Harvest CTA */}
            {(plot.growth_stage === "harvest_ready" ||
              plot.growth_stage === "mature") && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={async () => {
                  setHarvesting(true);
                  try {
                    await onHarvest?.(plot.id);
                  } finally {
                    setHarvesting(false);
                  }
                }}
                disabled={harvesting}
                className="mb-3 w-full rounded-xl bg-amber-500 py-3.5 text-center text-sm font-semibold text-white shadow-sm disabled:opacity-50"
              >
                <Scissors size={16} className="inline mr-1.5 -mt-0.5" />
                {harvesting ? "Harvesting..." : "Mark as Harvested"}
              </motion.button>
            )}

            {/* Plan next crop CTA */}
            {plot.growth_stage === "harvested" && (
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={() => {
                  onClose();
                  router.push(`/planting/${plot.id}`);
                }}
                className="mb-3 w-full rounded-xl bg-green-600 py-3.5 text-center text-sm font-semibold text-white shadow-lg"
              >
                <Sprout size={16} className="inline mr-1.5 -mt-0.5" />
                Plan next crop
              </motion.button>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
