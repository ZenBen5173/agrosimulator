"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import dynamic from "next/dynamic";
import type { GridJson } from "@/types/farm";

const FarmCanvas = dynamic(() => import("@/components/FarmCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-sky-100">
      <p className="text-green-700">Loading farm view...</p>
    </div>
  ),
});

const CROP_OPTIONS = [
  "Paddy",
  "Chilli",
  "Kangkung",
  "Banana",
  "Sweet Potato",
  "Corn",
  "Cucumber",
  "Tomato",
  "Eggplant",
  "Okra",
];

const MESSAGES = [
  "Analysing your farm shape...",
  "Planning crop placement...",
  "Optimising for your soil and water source...",
  "Almost ready...",
];

function LayoutContent() {
  const searchParams = useSearchParams();
  const farmId = searchParams.get("farm_id");
  const router = useRouter();

  const [gridJson, setGridJson] = useState<GridJson | null>(null);
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [messageIndex, setMessageIndex] = useState(0);
  const [selectedPlot, setSelectedPlot] = useState<string | null>(null);
  const [expandedPlot, setExpandedPlot] = useState<string | null>(null);
  const calledRef = useRef(false);

  // Cycle loading messages
  useEffect(() => {
    if (!loading) return;
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, [loading]);

  // Fetch plot layout
  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    if (!farmId) {
      setError("No farm ID found.");
      setLoading(false);
      return;
    }

    async function fetchLayout() {
      try {
        const res = await fetch("/api/onboarding/generate-plot-layout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ farm_id: farmId }),
        });

        if (!res.ok) {
          setError("Failed to generate plot layout. Tap to try again.");
          setLoading(false);
          return;
        }

        const data: GridJson = await res.json();
        setGridJson(data);
        setLoading(false);
      } catch {
        setError("Something went wrong. Tap to try again.");
        setLoading(false);
      }
    }

    fetchLayout();
  }, [farmId]);

  const handleTileClick = useCallback((plotLabel: string) => {
    setSelectedPlot(plotLabel);
    setExpandedPlot(plotLabel);
  }, []);

  function handleCropChange(plotLabel: string, newCrop: string) {
    setOverrides((prev) => ({ ...prev, [plotLabel]: newCrop }));
  }

  function handleConfirm() {
    if (!gridJson || !farmId) return;

    // Apply overrides to gridJson and store in sessionStorage for confirm page
    const finalGrid: GridJson = {
      grid: gridJson.grid,
      plots: { ...gridJson.plots },
    };
    for (const [label, crop] of Object.entries(overrides)) {
      if (finalGrid.plots[label]) {
        finalGrid.plots[label] = { ...finalGrid.plots[label], crop };
      }
    }

    sessionStorage.setItem("plotLayout", JSON.stringify(finalGrid));
    sessionStorage.setItem("plotLayoutFarmId", farmId);
    router.push("/onboarding/confirm");
  }

  function handleRetry() {
    setError("");
    setLoading(true);
    calledRef.current = false;
    window.location.reload();
  }

  // Build the display grid with overrides applied
  const displayGrid: GridJson | null = gridJson
    ? {
        grid: gridJson.grid,
        plots: Object.fromEntries(
          Object.entries(gridJson.plots).map(([label, info]) => [
            label,
            overrides[label]
              ? { ...info, crop: overrides[label] }
              : info,
          ])
        ),
      }
    : null;

  if (error) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-green-50 px-6">
        <p className="text-lg text-red-600">{error}</p>
        <button
          onClick={handleRetry}
          className="mt-4 rounded-xl bg-green-600 px-8 py-3 text-lg font-semibold text-white"
        >
          Try again
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-green-50 px-6">
        <div className="relative flex h-32 w-32 items-center justify-center">
          <div className="absolute h-full w-full animate-ping rounded-full bg-green-200 opacity-30" />
          <div className="absolute h-24 w-24 animate-pulse rounded-full bg-green-100" />
          <span className="relative text-6xl">🌱</span>
        </div>
        <p
          key={messageIndex}
          className="mt-8 text-center text-lg font-medium text-green-800"
        >
          {MESSAGES[messageIndex]}
        </p>
      </div>
    );
  }

  if (!displayGrid) return null;

  const plotEntries = Object.entries(displayGrid.plots);

  return (
    <div className="flex min-h-screen flex-col bg-green-50">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-center text-xl font-bold text-green-800">
          Your Plot Layout
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          AI-suggested crop placement
        </p>
      </div>

      {/* Farm Canvas — 55vh */}
      <div className="mx-2 overflow-hidden rounded-2xl" style={{ height: "55vh" }}>
        <FarmCanvas
          gridJson={displayGrid}
          onTileClick={handleTileClick}
          className="h-full w-full"
        />
      </div>

      {/* Plot list */}
      <div className="flex-1 overflow-y-auto px-4 pt-3 pb-28">
        <h2 className="mb-2 text-sm font-semibold text-gray-500 uppercase">
          Plots
        </h2>
        <div className="space-y-2">
          {plotEntries.map(([label, info]) => {
            const isExpanded = expandedPlot === label;
            const isSelected = selectedPlot === label;
            const isOverridden = label in overrides;

            return (
              <div
                key={label}
                className={`rounded-xl bg-white p-3 shadow-sm transition-all ${
                  isSelected ? "ring-2 ring-green-500" : ""
                }`}
              >
                <button
                  className="flex w-full items-center gap-3 text-left"
                  onClick={() =>
                    setExpandedPlot(isExpanded ? null : label)
                  }
                >
                  {/* Colour dot */}
                  <span
                    className="h-5 w-5 flex-shrink-0 rounded-full border border-gray-200"
                    style={{ backgroundColor: info.colour }}
                  />
                  <span className="flex-1">
                    <span className="text-sm font-bold text-gray-800">
                      {label}
                    </span>
                    <span className="ml-2 text-sm text-gray-600">
                      {info.crop}
                    </span>
                    {isOverridden && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs text-blue-700">
                        Changed
                      </span>
                    )}
                  </span>
                  <span className="text-gray-400">
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </button>

                {isExpanded && (
                  <div className="mt-2 border-t border-gray-100 pt-2">
                    <p className="mb-2 text-sm leading-relaxed text-gray-600">
                      {gridJson!.plots[label].reason}
                    </p>
                    <label className="block text-xs font-medium text-gray-500">
                      Change crop
                    </label>
                    <select
                      value={overrides[label] ?? info.crop}
                      onChange={(e) =>
                        handleCropChange(label, e.target.value)
                      }
                      className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-base"
                    >
                      {CROP_OPTIONS.map((crop) => (
                        <option key={crop} value={crop}>
                          {crop}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div
        className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white p-4"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handleConfirm}
          className="mx-auto block w-full max-w-md rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-700"
        >
          I&apos;m happy with this layout →
        </button>
      </div>
    </div>
  );
}

export default function LayoutPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-green-50">
          <p className="text-lg text-green-700">Loading...</p>
        </div>
      }
    >
      <LayoutContent />
    </Suspense>
  );
}
