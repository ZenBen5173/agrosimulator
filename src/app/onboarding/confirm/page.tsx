"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface ZoneRow {
  id: string;
  zone_label: string;
  suggested_crop: string;
  crop_override: string | null;
  colour_hex: string;
  area_sqm: number;
}

function ConfirmForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const farmId = searchParams.get("farm_id");

  const [zones, setZones] = useState<ZoneRow[]>([]);
  const [plantMode, setPlantMode] = useState<"fresh" | "existing">("fresh");
  const [plotDates, setPlotDates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!farmId) {
      router.replace("/onboarding/map");
      return;
    }

    async function loadZones() {
      const { data } = await supabase
        .from("farm_zones")
        .select("id, zone_label, suggested_crop, crop_override, colour_hex, area_sqm")
        .eq("farm_id", farmId)
        .order("zone_label");

      if (!data || data.length === 0) {
        // No zones — fallback: just mark onboarding done
        await supabase
          .from("farms")
          .update({ onboarding_done: true })
          .eq("id", farmId);
        router.push("/home");
        return;
      }

      setZones(data);

      // Initialize dates for each zone
      const today = new Date().toISOString().split("T")[0];
      const dates: Record<string, string> = {};
      for (const z of data) {
        dates[z.zone_label] = today;
      }
      setPlotDates(dates);
      setLoading(false);
    }

    loadZones();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [farmId]);

  async function handleLaunch() {
    if (!farmId || zones.length === 0) return;
    setSaving(true);
    setError("");

    try {
      const today = new Date().toISOString().split("T")[0];

      // 1. Create plots from zones
      const plotRows = zones.map((z) => ({
        farm_id: farmId,
        label: z.zone_label,
        crop_name: z.crop_override || z.suggested_crop,
        growth_stage: "seedling",
        planted_date:
          plantMode === "fresh" ? today : plotDates[z.zone_label] || today,
        colour_hex: z.colour_hex,
        is_active: true,
        warning_level: "none",
        risk_score: 0,
        ai_placement_reason: `Zone ${z.zone_label} — ${(z.area_sqm / 4046.86).toFixed(1)} acres`,
      }));

      const { error: plotError } = await supabase
        .from("plots")
        .insert(plotRows);

      if (plotError) {
        console.error("Plot insert error:", plotError);
        setError("Failed to save plots. Please try again.");
        setSaving(false);
        return;
      }

      // 2. Mark farm as onboarding complete
      const { error: farmError } = await supabase
        .from("farms")
        .update({ onboarding_done: true })
        .eq("id", farmId);

      if (farmError) {
        console.error("Farm update error:", farmError);
      }

      router.push("/home");
    } catch (err) {
      console.error("Launch error:", err);
      setError("Something went wrong. Please try again.");
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-50">
        <p className="text-lg text-green-700">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen flex-col bg-green-50">
      {/* Header */}
      <div className="px-4 pt-6 pb-2">
        <h1 className="text-center text-xl font-bold text-green-800">
          Confirm Your Farm
        </h1>
        <p className="mt-1 text-center text-sm text-gray-500">
          {zones.length} zone{zones.length !== 1 ? "s" : ""} ready to plant
        </p>
      </div>

      {/* Zone summary */}
      <div className="mx-4 mt-3 space-y-2">
        {zones.map((z) => (
          <div
            key={z.id}
            className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
          >
            <div
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
              style={{ backgroundColor: z.colour_hex }}
              aria-label={`Zone ${z.zone_label}`}
            >
              {z.zone_label}
            </div>
            <div className="flex-1">
              <p className="text-sm font-semibold text-gray-800">
                {z.crop_override || z.suggested_crop}
              </p>
              <p className="text-xs text-gray-500">
                {(z.area_sqm / 4046.86).toFixed(2)} acres
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Planting date section */}
      <div className="flex-1 overflow-y-auto px-4 pt-5 pb-32">
        <h2 className="mb-3 text-lg font-bold text-gray-800">
          When did you plant these crops?
        </h2>

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
                Set a planting date for each zone
              </p>
            </div>
          </label>
        </div>

        {/* Per-zone date pickers */}
        {plantMode === "existing" && (
          <div className="mt-4 space-y-3">
            {zones.map((z) => (
              <div
                key={z.id}
                className="flex items-center gap-3 rounded-xl bg-white p-3 shadow-sm"
              >
                <span
                  className="h-4 w-4 flex-shrink-0 rounded-full border border-gray-200"
                  style={{ backgroundColor: z.colour_hex }}
                />
                <span className="flex-1 text-sm font-medium text-gray-800">
                  {z.zone_label} — {z.crop_override || z.suggested_crop}
                </span>
                <input
                  type="date"
                  aria-label={`Planting date for zone ${z.zone_label}`}
                  value={plotDates[z.zone_label] || ""}
                  onChange={(e) =>
                    setPlotDates((prev) => ({
                      ...prev,
                      [z.zone_label]: e.target.value,
                    }))
                  }
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-base"
                />
              </div>
            ))}
          </div>
        )}

        {error && (
          <p role="alert" aria-live="assertive" className="mt-4 text-center text-sm text-red-600">{error}</p>
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
          className="mx-auto block w-full max-w-md rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-500"
        >
          {saving ? "Setting up your farm..." : "Launch my farm"}
        </button>
      </div>
    </div>
  );
}

export default function ConfirmPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-green-50">
          <p className="text-lg text-green-700">Loading...</p>
        </div>
      }
    >
      <ConfirmForm />
    </Suspense>
  );
}
