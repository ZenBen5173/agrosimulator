"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { GridJson } from "@/types/farm";

const FarmCanvas = dynamic(() => import("@/components/FarmCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex h-full items-center justify-center bg-sky-100">
      <p className="text-green-700">Loading farm view...</p>
    </div>
  ),
});

export default function ConfirmPage() {
  const router = useRouter();
  const supabase = createClient();

  const [gridJson, setGridJson] = useState<GridJson | null>(null);
  const [farmId, setFarmId] = useState<string | null>(null);
  const [plantMode, setPlantMode] = useState<"fresh" | "existing">("fresh");
  const [plotDates, setPlotDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = sessionStorage.getItem("plotLayout");
    const storedFarmId = sessionStorage.getItem("plotLayoutFarmId");

    if (!stored || !storedFarmId) {
      router.replace("/onboarding/map");
      return;
    }

    try {
      const parsed: GridJson = JSON.parse(stored);
      setGridJson(parsed);
      setFarmId(storedFarmId);

      // Initialise dates for each plot to today
      const today = new Date().toISOString().split("T")[0];
      const dates: Record<string, string> = {};
      for (const label of Object.keys(parsed.plots)) {
        dates[label] = today;
      }
      setPlotDates(dates);
    } catch {
      router.replace("/onboarding/map");
    }
  }, [router]);

  async function handleLaunch() {
    if (!gridJson || !farmId) return;
    setSaving(true);
    setError("");

    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Insert plots
      const plotRows = Object.entries(gridJson.plots).map(
        ([label, info]) => ({
          farm_id: farmId,
          label,
          crop_name: info.crop,
          growth_stage: "seedling",
          planted_date:
            plantMode === "fresh" ? today : plotDates[label] || today,
          colour_hex: info.colour,
          is_active: true,
          warning_level: "none",
          risk_score: 0,
          ai_placement_reason: info.reason,
        })
      );

      const { data: insertedPlots, error: plotError } = await supabase
        .from("plots")
        .insert(plotRows)
        .select("id, label");

      if (plotError) {
        console.error("Plot insert error:", plotError);
        setError("Failed to save plots. Please try again.");
        setSaving(false);
        return;
      }

      // Build label → plot id map
      const plotIdMap: Record<string, string> = {};
      if (insertedPlots) {
        for (const p of insertedPlots) {
          plotIdMap[p.label] = p.id;
        }
      }

      // 2. Insert grid cells
      const cellRows: {
        farm_id: string;
        row: number;
        col: number;
        is_active: boolean;
        plot_id: string | null;
      }[] = [];

      for (let r = 0; r < gridJson.grid.length; r++) {
        for (let c = 0; c < gridJson.grid[r].length; c++) {
          const label = gridJson.grid[r][c];
          const isActive = label !== "out";
          cellRows.push({
            farm_id: farmId,
            row: r,
            col: c,
            is_active: isActive,
            plot_id: isActive ? plotIdMap[label] || null : null,
          });
        }
      }

      const { error: cellError } = await supabase
        .from("grid_cells")
        .insert(cellRows);

      if (cellError) {
        console.error("Grid cell insert error:", cellError);
        setError("Failed to save grid. Please try again.");
        setSaving(false);
        return;
      }

      // 3. Mark farm as onboarding complete
      const { error: farmError } = await supabase
        .from("farms")
        .update({ onboarding_done: true })
        .eq("id", farmId);

      if (farmError) {
        console.error("Farm update error:", farmError);
      }

      // Clean up sessionStorage
      sessionStorage.removeItem("plotLayout");
      sessionStorage.removeItem("plotLayoutFarmId");

      // Navigate to home
      router.push("/home");
    } catch (err) {
      console.error("Launch error:", err);
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  if (!gridJson) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-50">
        <p className="text-lg text-green-700">Loading...</p>
      </div>
    );
  }

  const plotEntries = Object.entries(gridJson.plots);

  return (
    <div className="flex min-h-screen flex-col bg-green-50">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-center text-xl font-bold text-green-800">
          Confirm Your Farm
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          Review your layout and set planting dates
        </p>
      </div>

      {/* Farm Canvas — read only, smaller */}
      <div
        className="mx-2 overflow-hidden rounded-2xl"
        style={{ height: "40vh" }}
      >
        <FarmCanvas gridJson={gridJson} className="h-full w-full" />
      </div>

      {/* Planting date section */}
      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-32">
        <h2 className="mb-3 text-lg font-bold text-gray-800">
          When did you plant these crops?
        </h2>

        {/* Radio options */}
        <div className="space-y-2">
          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
              plantMode === "fresh"
                ? "border-green-500 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name="plantMode"
              value="fresh"
              checked={plantMode === "fresh"}
              onChange={() => setPlantMode("fresh")}
              className="h-5 w-5 text-green-600"
            />
            <div>
              <p className="font-semibold text-gray-800">
                Starting fresh today
              </p>
              <p className="text-sm text-gray-500">
                All crops will be marked as planted today
              </p>
            </div>
          </label>

          <label
            className={`flex cursor-pointer items-center gap-3 rounded-xl border-2 p-4 transition-colors ${
              plantMode === "existing"
                ? "border-green-500 bg-green-50"
                : "border-gray-200 bg-white"
            }`}
          >
            <input
              type="radio"
              name="plantMode"
              value="existing"
              checked={plantMode === "existing"}
              onChange={() => setPlantMode("existing")}
              className="h-5 w-5 text-green-600"
            />
            <div>
              <p className="font-semibold text-gray-800">
                I already have crops growing
              </p>
              <p className="text-sm text-gray-500">
                Set a planting date for each plot
              </p>
            </div>
          </label>
        </div>

        {/* Per-plot date pickers */}
        {plantMode === "existing" && (
          <div className="mt-4 space-y-3">
            {plotEntries.map(([label, info]) => (
              <div
                key={label}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
              >
                <span
                  className="h-4 w-4 flex-shrink-0 rounded-full border border-gray-200"
                  style={{ backgroundColor: info.colour }}
                />
                <span className="flex-1 text-sm font-medium text-gray-800">
                  {label} — {info.crop}
                </span>
                <input
                  type="date"
                  value={plotDates[label] || ""}
                  onChange={(e) =>
                    setPlotDates((prev) => ({
                      ...prev,
                      [label]: e.target.value,
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-base"
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p className="mt-4 text-center text-sm text-red-600">{error}</p>
        )}
      </div>

      {/* Fixed bottom CTA */}
      <div
        className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white p-4"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handleLaunch}
          disabled={saving}
          className="mx-auto block w-full max-w-md rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
        >
          {saving ? "Setting up your farm..." : "Launch my farm 🌾"}
        </button>
      </div>
    </div>
  );
}
