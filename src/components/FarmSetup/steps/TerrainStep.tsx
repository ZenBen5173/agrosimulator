"use client";

import { useOnboardingStore, type TerrainType } from "../useOnboardingStore";

const TERRAIN_OPTIONS: {
  type: TerrainType;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    type: "flat",
    label: "Flat",
    icon: "---",
    description: "Level ground, easy to irrigate evenly",
  },
  {
    type: "sloped",
    label: "Sloped",
    icon: "/",
    description: "Hillside or gradient, water runs downhill",
  },
  {
    type: "terraced",
    label: "Terraced",
    icon: "===",
    description: "Step-like levels, common for rice paddies",
  },
];

export default function TerrainStep() {
  const { terrainType, setTerrainType, nextStep, prevStep } =
    useOnboardingStore();

  return (
    <div className="absolute right-0 bottom-0 left-0 z-[1000]">
      <div className="rounded-t-2xl bg-white/95 px-4 pt-4 pb-6 shadow-2xl backdrop-blur-sm">
        <h3 className="mb-3 text-center text-sm font-semibold text-gray-800">
          What best describes your farm terrain?
        </h3>

        {/* Terrain cards */}
        <div className="mb-4 flex gap-3">
          {TERRAIN_OPTIONS.map((t) => (
            <button
              key={t.type}
              onClick={() => setTerrainType(t.type)}
              className={`flex flex-1 flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 transition ${
                terrainType === t.type
                  ? "border-green-500 bg-green-50"
                  : "border-gray-200 bg-white"
              }`}
            >
              <div
                className={`flex h-10 w-10 items-center justify-center rounded-full text-lg font-bold ${
                  terrainType === t.type
                    ? "bg-green-500 text-white"
                    : "bg-gray-100 text-gray-500"
                }`}
              >
                {t.type === "flat" ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="16" x2="21" y2="16" />
                    <line x1="3" y1="12" x2="21" y2="12" strokeOpacity="0.3" strokeDasharray="4 2" />
                  </svg>
                ) : t.type === "sloped" ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <line x1="3" y1="18" x2="21" y2="8" />
                    <line x1="3" y1="18" x2="21" y2="18" strokeOpacity="0.3" />
                  </svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M3 18 H9 V14 H15 V10 H21" />
                    <line x1="3" y1="18" x2="21" y2="18" strokeOpacity="0.3" />
                  </svg>
                )}
              </div>
              <span
                className={`text-xs font-semibold ${
                  terrainType === t.type ? "text-green-700" : "text-gray-700"
                }`}
              >
                {t.label}
              </span>
              <span className="text-center text-[10px] leading-tight text-gray-500">
                {t.description}
              </span>
            </button>
          ))}
        </div>

        {/* Actions */}
        <div className="flex gap-3">
          <button
            onClick={prevStep}
            className="rounded-xl border border-gray-200 px-4 py-3 text-sm font-medium text-gray-600"
          >
            Back
          </button>
          <button
            onClick={nextStep}
            className="flex-1 rounded-xl bg-green-600 py-3 text-sm font-semibold text-white"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}
