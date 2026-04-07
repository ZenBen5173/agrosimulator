"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

interface PlotInfo {
  id: string;
  label: string;
  crop_name: string;
  warning_level: string;
  warning_reason: string | null;
  farm_id: string;
}

function InspectionBriefing() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plotId = searchParams.get("plot_id");
  const supabase = createClient();

  const [plot, setPlot] = useState<PlotInfo | null>(null);
  const [tips, setTips] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!plotId) {
        router.replace("/home");
        return;
      }

      const { data } = await supabase
        .from("plots")
        .select("id, label, crop_name, warning_level, warning_reason, farm_id")
        .eq("id", plotId)
        .single();

      if (!data) {
        router.replace("/home");
        return;
      }

      setPlot(data);
      setLoading(false);

      // Fetch inspection tips (non-blocking)
      try {
        const res = await fetch("/api/inspection/tips", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ crop_name: data.crop_name }),
        });
        if (res.ok) {
          const result = await res.json();
          setTips(result.tips || []);
        }
      } catch {
        // Non-critical, use defaults
        setTips([
          "Look for unusual spots, discolouration, or wilting",
          "Check the underside of leaves for pests",
          "Compare affected plants with nearby healthy ones",
        ]);
      }
    }
    load();
  }, [plotId, supabase, router]);

  const handleStart = useCallback(() => {
    if (plot) {
      router.push(
        `/inspection/capture?plot_id=${plot.id}&farm_id=${plot.farm_id}&crop_name=${encodeURIComponent(plot.crop_name)}&plot_label=${plot.label}`
      );
    }
  }, [plot, router]);

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-green-50">
        <div className="flex flex-col items-center gap-4">
          <div className="relative flex h-20 w-20 items-center justify-center">
            <div className="absolute h-full w-full animate-pulse rounded-full bg-green-100" />
            <span className="relative text-4xl">🔍</span>
          </div>
          <p className="text-green-700">Preparing inspection...</p>
        </div>
      </div>
    );
  }

  if (!plot) return null;

  return (
    <div className="min-h-screen bg-green-50 px-5 py-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-gray-500"
        >
          ← Back
        </button>
        <h1 className="text-2xl font-bold text-gray-900">
          Inspect Plot {plot.label}
        </h1>
        <p className="mt-1 text-gray-600">{plot.crop_name}</p>
      </div>

      {/* Warning reason */}
      {plot.warning_reason &&
        plot.warning_level !== "none" && (
          <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4">
            <p className="text-sm font-medium text-orange-800">
              ⚠ AI flagged this plot because:
            </p>
            <p className="mt-1 text-sm text-orange-700">
              {plot.warning_reason}
            </p>
          </div>
        )}

      {/* What to look for */}
      <div className="mb-6">
        <h2 className="mb-3 text-sm font-bold text-gray-800">
          What to look for
        </h2>
        <div className="space-y-2">
          {(tips.length > 0
            ? tips
            : [
                "Look for unusual spots, discolouration, or wilting",
                "Check the underside of leaves for pests",
                "Compare affected plants with nearby healthy ones",
              ]
          ).map((tip, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-lg bg-white p-3 shadow-sm"
            >
              <span className="mt-0.5 text-green-500">●</span>
              <span className="text-sm text-gray-700">{tip}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Photo guide */}
      <div className="mb-8">
        <h2 className="mb-3 text-sm font-bold text-gray-800">
          You will take 3 photos
        </h2>
        <div className="space-y-3">
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
            <span className="text-2xl">📸</span>
            <div>
              <p className="text-sm font-medium text-gray-800">Full plant</p>
              <p className="text-xs text-gray-500">
                Step back 1 metre, capture the whole plant
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
            <span className="text-2xl">🔍</span>
            <div>
              <p className="text-sm font-medium text-gray-800">Close-up</p>
              <p className="text-xs text-gray-500">
                Get close to any affected area (spots, discolouration, damage)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 rounded-xl bg-white p-4 shadow-sm">
            <span className="text-2xl">🌿</span>
            <div>
              <p className="text-sm font-medium text-gray-800">
                Healthy comparison
              </p>
              <p className="text-xs text-gray-500">
                Photograph a nearby healthy plant
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={handleStart}
        className="w-full rounded-2xl bg-green-600 py-4 text-center text-base font-semibold text-white shadow-lg transition-colors hover:bg-green-700"
      >
        I&apos;m at the farm &mdash; start inspection &rarr;
      </button>
    </div>
  );
}

// Tips API route (simple Gemini prompt — create inline since it's tiny)
export default function InspectionPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center bg-green-50">
          <p className="text-green-700">Loading...</p>
        </div>
      }
    >
      <InspectionBriefing />
    </Suspense>
  );
}
