"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

export default function AnalysingPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function analyse() {
      const raw = sessionStorage.getItem("inspection_data");
      if (!raw) {
        router.replace("/home");
        return;
      }

      const data = JSON.parse(raw);

      try {
        const res = await fetch("/api/inspection/analyse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            farm_id: data.farm_id,
            plot_id: data.plot_id,
            photo_base64s: data.photo_base64s,
            crop_name: data.crop_name,
            plot_label: data.plot_label,
          }),
        });

        if (!res.ok) {
          setError("Analysis failed. Please try again.");
          return;
        }

        const result = await res.json();

        // Store analysis result
        sessionStorage.setItem(
          "analysis_result",
          JSON.stringify(result)
        );

        if (result.can_diagnose_now) {
          // High confidence — call diagnose directly with empty answers
          const diagRes = await fetch("/api/inspection/diagnose", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              farm_id: data.farm_id,
              plot_id: data.plot_id,
              photo_base64s: data.photo_base64s,
              crop_name: data.crop_name,
              farmer_answers: [],
            }),
          });

          if (diagRes.ok) {
            const diagResult = await diagRes.json();
            sessionStorage.setItem(
              "diagnosis_result",
              JSON.stringify(diagResult)
            );
            router.replace("/inspection/result");
          } else {
            setError("Diagnosis failed. Please try again.");
          }
        } else {
          // Need follow-up questions
          router.replace("/inspection/questions");
        }
      } catch {
        setError("Something went wrong. Please try again.");
      }
    }

    analyse();
  }, [router]);

  return (
    <div className="flex h-screen flex-col items-center justify-center bg-green-50 px-6">
      <div className="flex flex-col items-center gap-6">
        <div className="relative flex h-24 w-24 items-center justify-center">
          <div className="absolute h-full w-full animate-pulse rounded-full bg-green-100" />
          <span className="relative text-5xl" aria-hidden="true">🌿</span>
        </div>

        {error ? (
          <div role="alert">
            <p className="text-center text-red-600">{error}</p>
            <button
              onClick={() => {
                setError(null);
                window.location.reload();
              }}
              className="mt-6 rounded-xl bg-green-600 px-6 py-3 text-white"
            >
              Try again
            </button>
          </div>
        ) : (
          <div role="status" aria-live="polite">
            <p className="text-lg font-medium text-green-800">
              Analysing your crop photos...
            </p>
            <p className="mt-2 text-sm text-gray-500">
              This usually takes 5&ndash;10 seconds
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
