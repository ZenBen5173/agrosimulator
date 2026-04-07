"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const SOIL_OPTIONS = [
  { value: "clay", label: "Clay" },
  { value: "clay_loam", label: "Clay Loam" },
  { value: "loam", label: "Loam" },
  { value: "sandy_loam", label: "Sandy Loam" },
  { value: "sandy", label: "Sandy" },
  { value: "peat", label: "Peat" },
];

const WATER_OPTIONS = [
  { value: "rain_fed", label: "Rain-fed" },
  { value: "irrigated", label: "Irrigated" },
  { value: "both", label: "Both" },
];

const SOIL_GUIDE = [
  {
    emoji: "✊",
    title: "The Feel Test",
    desc: "Take a handful of moist soil, squeeze it tight and then release.",
  },
  {
    emoji: "🟤",
    title: "Clay",
    desc: "Stays in a firm ball, feels sticky and smooth.",
  },
  {
    emoji: "🫳",
    title: "Loam",
    desc: "Holds shape briefly then crumbles, feels smooth with a little grit.",
  },
  {
    emoji: "🏖️",
    title: "Sandy",
    desc: "Falls apart immediately, feels gritty.",
  },
  {
    emoji: "🪵",
    title: "Peat",
    desc: "Dark brown or black, feels spongy, smells earthy.",
  },
];

interface SuggestionData {
  suggested_soil: string;
  soil_reasoning: string;
  suggested_water: string;
  water_reasoning: string;
  plot_layout_json: {
    soil_confidence?: string;
    nearby_irrigation_scheme?: string | null;
  } | null;
}

interface FarmData {
  area_acres: number;
}

function DetailsForm() {
  const searchParams = useSearchParams();
  const farmId = searchParams.get("farm_id");
  const router = useRouter();
  const supabase = createClient();

  const [suggestion, setSuggestion] = useState<SuggestionData | null>(null);
  const [farm, setFarm] = useState<FarmData | null>(null);
  const [soil, setSoil] = useState("");
  const [soilEdited, setSoilEdited] = useState(false);
  const [water, setWater] = useState("");
  const [showSoilGuide, setShowSoilGuide] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!farmId) {
      router.replace("/onboarding/map");
      return;
    }

    async function load() {
      const { data: suggestion } = await supabase
        .from("onboarding_ai_suggestions")
        .select("suggested_soil, soil_reasoning, suggested_water, water_reasoning, plot_layout_json")
        .eq("farm_id", farmId)
        .single();

      const { data: farmRow } = await supabase
        .from("farms")
        .select("area_acres")
        .eq("id", farmId)
        .single();

      if (suggestion) {
        setSuggestion(suggestion);
        setSoil(suggestion.suggested_soil);
        setWater(suggestion.suggested_water);
      }
      if (farmRow) setFarm(farmRow);
      setLoading(false);
    }

    load();
  }, [farmId, supabase, router]);

  async function handleConfirm() {
    if (!farmId) return;
    setSaving(true);

    await supabase
      .from("farms")
      .update({ soil_type: soil, water_source: water })
      .eq("id", farmId);

    await supabase
      .from("onboarding_ai_suggestions")
      .update({ farmer_confirmed_at: new Date().toISOString() })
      .eq("farm_id", farmId);

    router.push(`/onboarding/layout?farm_id=${farmId}`);
  }

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-50">
        <p className="text-lg text-green-700">Loading...</p>
      </div>
    );
  }

  if (!suggestion || !farm) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-green-50 px-4">
        <div className="text-center">
          <p className="text-lg text-red-600">Could not load farm details.</p>
          <button
            onClick={() => router.push("/onboarding/map")}
            className="mt-4 rounded-xl bg-green-600 px-6 py-3 text-white"
          >
            Go back
          </button>
        </div>
      </div>
    );
  }

  const soilLabel = SOIL_OPTIONS.find((o) => o.value === soil)?.label || soil;
  const extra = suggestion.plot_layout_json;
  const confidence = extra?.soil_confidence || "medium";
  const irrigationScheme = extra?.nearby_irrigation_scheme || null;

  const confidenceColor =
    confidence === "high"
      ? "bg-green-100 text-green-800"
      : confidence === "medium"
        ? "bg-amber-100 text-amber-800"
        : "bg-gray-100 text-gray-600";

  return (
    <div className="min-h-screen bg-green-50 px-4 pb-32 pt-6">
      <h1 className="mb-6 text-center text-2xl font-bold text-green-800">
        Your Farm Details
      </h1>

      <div className="mx-auto max-w-md space-y-4">
        {/* Card 1 — Soil Type */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <div className="mb-2 flex items-center justify-between">
            <h2 className="text-lg font-bold text-gray-900">Your Soil Type</h2>
            {soilEdited ? (
              <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-medium text-blue-700">
                Edited by you
              </span>
            ) : (
              <span
                className={`rounded-full px-3 py-1 text-xs font-medium ${confidenceColor}`}
              >
                AI Suggestion — {confidence}
              </span>
            )}
          </div>

          <p className="mb-1 text-2xl font-bold text-green-700">{soilLabel}</p>
          <p className="mb-3 text-sm leading-relaxed text-gray-600">
            {suggestion.soil_reasoning}
          </p>

          <button
            onClick={() => setShowSoilGuide(true)}
            className="mb-3 text-sm font-medium text-green-600 underline"
          >
            How to identify your soil
          </button>

          <select
            value={soil}
            onChange={(e) => {
              setSoil(e.target.value);
              if (e.target.value !== suggestion.suggested_soil) {
                setSoilEdited(true);
              } else {
                setSoilEdited(false);
              }
            }}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          >
            {SOIL_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Card 2 — Water Source */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-gray-900">Water Source</h2>

          <p className="mb-1 text-2xl font-bold text-green-700">
            {WATER_OPTIONS.find((o) => o.value === water)?.label || water}
          </p>

          {irrigationScheme && (
            <span className="mb-2 inline-block rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700">
              Near {irrigationScheme} irrigation zone
            </span>
          )}

          <p className="mb-3 text-sm leading-relaxed text-gray-600">
            {suggestion.water_reasoning}
          </p>

          <select
            value={water}
            onChange={(e) => setWater(e.target.value)}
            className="w-full rounded-lg border border-gray-300 px-4 py-3 text-base"
          >
            {WATER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        {/* Card 3 — Farm Size */}
        <div className="rounded-2xl bg-white p-5 shadow-sm">
          <h2 className="mb-2 text-lg font-bold text-gray-900">Farm Size</h2>
          <p className="text-2xl font-bold text-green-700">
            {farm.area_acres.toFixed(1)} acres
          </p>
          <p className="mb-2 text-sm text-gray-500">
            Based on the area you drew
          </p>
          <button
            onClick={() => router.push("/onboarding/map")}
            className="text-sm font-medium text-green-600 underline"
          >
            Redraw my farm
          </button>
        </div>
      </div>

      {/* Fixed bottom CTA */}
      <div
        className="fixed right-0 bottom-0 left-0 border-t border-gray-200 bg-white p-4"
        style={{ paddingBottom: "calc(16px + env(safe-area-inset-bottom))" }}
      >
        <button
          onClick={handleConfirm}
          disabled={saving}
          className="mx-auto block w-full max-w-md rounded-xl bg-green-600 py-4 text-lg font-semibold text-white transition-colors hover:bg-green-700 disabled:bg-green-400"
        >
          {saving
            ? "Saving..."
            : "This looks right — show me my plot layout →"}
        </button>
      </div>

      {/* Soil Guide Bottom Sheet */}
      {showSoilGuide && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setShowSoilGuide(false)}
        >
          <div
            className="w-full max-w-md rounded-t-2xl bg-white px-4 pb-6 pt-4"
            style={{
              paddingBottom: "calc(24px + env(safe-area-inset-bottom))",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mb-4 h-1 w-12 rounded-full bg-gray-300" />
            <h2 className="mb-4 text-lg font-bold text-gray-900">
              How to identify your soil
            </h2>

            {/* Swipeable cards */}
            <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-4">
              {SOIL_GUIDE.map((card, i) => (
                <div
                  key={i}
                  className="min-w-[240px] flex-shrink-0 snap-center rounded-xl bg-green-50 p-4"
                >
                  <span className="mb-2 block text-3xl">{card.emoji}</span>
                  <h3 className="mb-1 text-base font-bold text-gray-900">
                    {card.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-gray-700">
                    {card.desc}
                  </p>
                </div>
              ))}
            </div>

            <button
              onClick={() => setShowSoilGuide(false)}
              className="mt-2 w-full rounded-xl bg-green-600 py-3 text-base font-semibold text-white"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function DetailsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-green-50">
          <p className="text-lg text-green-700">Loading...</p>
        </div>
      }
    >
      <DetailsForm />
    </Suspense>
  );
}
