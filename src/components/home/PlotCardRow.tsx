"use client";

import { motion } from "framer-motion";
import ProgressRing from "@/components/ui/ProgressRing";
import { useFarmStore } from "@/stores/farmStore";

const STAGE_COLOR: Record<string, string> = {
  seedling: "#84cc16",
  growing: "#22c55e",
  mature: "#10b981",
  harvest_ready: "#f59e0b",
  harvested: "#9ca3af",
};

function getProgress(planted: string | null, harvest: string | null): number {
  if (!planted || !harvest) return 0;
  const now = Date.now();
  const start = new Date(planted).getTime();
  const end = new Date(harvest).getTime();
  if (end <= start) return 1;
  return Math.min(1, Math.max(0, (now - start) / (end - start)));
}

export default function PlotCardRow() {
  const plots = useFarmStore((s) => s.plots);
  const setSelectedPlot = useFarmStore((s) => s.setSelectedPlot);

  if (plots.length === 0) return null;

  return (
    <div className="mb-4">
      <h3 className="mb-2 text-sm font-bold text-gray-800">Your Plots</h3>
      <div className="relative">
        <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
          {plots.map((plot, i) => {
            const progress = getProgress(plot.planted_date, plot.expected_harvest);
            const growthPercent = Math.round(progress * 100);
            const ringColor = STAGE_COLOR[plot.growth_stage] || "#9ca3af";
            const hasWarning =
              plot.warning_level === "orange" || plot.warning_level === "red";
            const justPlanted = plot.growth_stage === "seedling" && growthPercent === 0;

            return (
              <motion.button
                key={plot.id}
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setSelectedPlot(plot)}
                aria-label={`Plot ${plot.label}: ${plot.crop_name}, ${growthPercent}% grown${plot.warning_level !== "none" ? ", warning: " + plot.warning_level : ""}`}
                className="relative flex min-w-[100px] flex-shrink-0 flex-col items-center rounded-2xl bg-white p-3 shadow-[0_2px_12px_rgba(0,0,0,0.06)] border border-gray-100"
              >
                {/* Colour stripe */}
                <div
                  className="absolute top-0 left-0 right-0 h-1 rounded-t-2xl"
                  style={{ backgroundColor: plot.colour_hex }}
                  aria-hidden="true"
                />

                {/* Warning dot */}
                {hasWarning && (
                  <div className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-red-500 ring-2 ring-white" aria-hidden="true" />
                )}

                <ProgressRing
                  progress={progress}
                  size={48}
                  strokeWidth={4}
                  color={ringColor}
                >
                  <span className="text-xs font-bold text-gray-700">
                    {growthPercent}%
                  </span>
                </ProgressRing>

                <span className="mt-2 text-xs font-bold text-gray-800">
                  {plot.label}
                </span>
                <span className="text-[10px] text-gray-500 truncate max-w-[80px]">
                  {plot.crop_name}
                </span>
                {justPlanted && (
                  <span className="text-[10px] text-gray-500 italic">Just planted</span>
                )}
              </motion.button>
            );
          })}
        </div>
        <div className="absolute right-0 top-0 bottom-0 w-8 pointer-events-none bg-gradient-to-l from-gray-50 to-transparent" />
      </div>
    </div>
  );
}
