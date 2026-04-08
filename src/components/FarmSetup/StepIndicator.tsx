"use client";

import { TOTAL_STEPS } from "./useOnboardingStore";

const STEP_LABELS = [
  "Farm Boundary",
  "Water Features",
  "Roads & Paths",
  "Terrain",
  "Infrastructure",
  "Crop Zones",
];

export default function StepIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      {Array.from({ length: TOTAL_STEPS }).map((_, i) => (
        <div key={i} className="flex flex-col items-center">
          <div
            className={`h-2 rounded-full transition-all duration-300 ${
              i === step
                ? "w-8 bg-green-500"
                : i < step
                  ? "w-2 bg-green-400"
                  : "w-2 bg-gray-300"
            }`}
          />
        </div>
      ))}
      <span className="ml-2 text-xs font-medium text-white/80">
        {STEP_LABELS[step]}
      </span>
    </div>
  );
}
