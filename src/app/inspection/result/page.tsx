"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface DiagnosisResult {
  confidence: number;
  diagnosis: string | null;
  severity: string | null;
  what_it_is: string | null;
  why_this_plot: string | null;
  treatment_steps: string[] | null;
  watch_for: string[] | null;
  neighbouring_plot_risk: string | null;
  outcome: "confirmed" | "uncertain" | "cannot_determine";
}

function ExpandableSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl border border-gray-200 bg-white">
      <button
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between p-4 text-left"
        aria-expanded={open}
      >
        <span className="text-sm font-medium text-gray-800">{title}</span>
        <span className="text-gray-400" aria-hidden="true">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="border-t px-4 pb-4 pt-3">{children}</div>}
    </div>
  );
}

export default function ResultPage() {
  const router = useRouter();
  const [result, setResult] = useState<DiagnosisResult | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Set<number>>(new Set());

  useEffect(() => {
    const raw = sessionStorage.getItem("diagnosis_result");
    if (!raw) {
      router.replace("/home");
      return;
    }
    setResult(JSON.parse(raw));
  }, [router]);

  if (!result) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Loading result...</p>
      </div>
    );
  }

  const toggleStep = (i: number) => {
    setCompletedSteps((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };

  // --- VARIANT A: Confirmed ---
  if (result.outcome === "confirmed") {
    const highConfidence = result.confidence >= 0.92;
    return (
      <div className="min-h-screen bg-white px-5 py-6">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
            <span className="text-3xl" aria-hidden="true">🌿</span>
          </div>
          <h1 className="text-2xl font-bold text-gray-900">
            {result.diagnosis}
          </h1>
          <span
            className={`mt-2 rounded-full px-3 py-1 text-xs font-medium ${
              highConfidence
                ? "bg-green-100 text-green-700"
                : "bg-amber-100 text-amber-700"
            }`}
          >
            {highConfidence ? "High confidence" : "Moderate confidence"} (
            {Math.round(result.confidence * 100)}%)
          </span>
          {result.severity && (
            <span
              role="alert"
              className={`mt-2 rounded-full px-3 py-1 text-xs font-medium ${
                result.severity === "severe"
                  ? "bg-red-100 text-red-700"
                  : result.severity === "moderate"
                    ? "bg-orange-100 text-orange-700"
                    : "bg-yellow-100 text-yellow-700"
              }`}
            >
              {result.severity.charAt(0).toUpperCase() + result.severity.slice(1)}{" "}
              severity
            </span>
          )}
        </div>

        {/* Content sections */}
        <div className="space-y-3">
          {result.what_it_is && (
            <ExpandableSection title="What is this?">
              <p className="text-sm text-gray-600">{result.what_it_is}</p>
            </ExpandableSection>
          )}

          {result.why_this_plot && (
            <ExpandableSection title="Why did my plot get this?">
              <p className="text-sm text-gray-600">{result.why_this_plot}</p>
            </ExpandableSection>
          )}

          {/* Treatment steps — always visible */}
          {result.treatment_steps && result.treatment_steps.length > 0 && (
            <div className="rounded-xl border border-green-200 bg-green-50 p-4">
              <h3 className="mb-3 text-sm font-bold text-green-800">
                Treatment Steps
              </h3>
              <div className="space-y-2">
                {result.treatment_steps.map((step, i) => (
                  <button
                    key={i}
                    onClick={() => toggleStep(i)}
                    className="flex w-full items-start gap-3 text-left"
                    role="checkbox"
                    aria-checked={completedSteps.has(i)}
                    aria-label={`Step ${i + 1}: ${step}`}
                  >
                    <span
                      className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 text-xs ${
                        completedSteps.has(i)
                          ? "border-green-500 bg-green-500 text-white"
                          : "border-gray-300"
                      }`}
                      aria-hidden="true"
                    >
                      {completedSteps.has(i) ? "✓" : i + 1}
                    </span>
                    <span
                      className={`text-sm ${
                        completedSteps.has(i)
                          ? "text-gray-400 line-through"
                          : "text-gray-700"
                      }`}
                    >
                      {step}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {result.watch_for && result.watch_for.length > 0 && (
            <ExpandableSection title="Watch for these signs">
              <ul className="space-y-1">
                {result.watch_for.map((sign, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <span className="mt-0.5 text-amber-500" aria-hidden="true">●</span>
                    {sign}
                  </li>
                ))}
              </ul>
            </ExpandableSection>
          )}

          {/* Neighbouring plot alert */}
          {result.neighbouring_plot_risk && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
              <p className="text-sm font-medium text-amber-800">
                <span aria-hidden="true">⚠ </span>Neighbouring plots at risk
              </p>
              <p className="mt-1 text-sm text-amber-700">
                {result.neighbouring_plot_risk}
              </p>
            </div>
          )}
        </div>

        {/* CTA */}
        <button
          onClick={() => {
            sessionStorage.removeItem("inspection_data");
            sessionStorage.removeItem("analysis_result");
            sessionStorage.removeItem("diagnosis_result");
            router.push("/home");
          }}
          className="mt-8 w-full rounded-2xl bg-green-600 py-4 text-center text-base font-semibold text-white shadow-lg"
        >
          I&apos;ll start treatment &rarr;
        </button>
      </div>
    );
  }

  // --- VARIANT B: Uncertain ---
  if (result.outcome === "uncertain") {
    return (
      <div className="min-h-screen bg-white px-5 py-6">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-amber-100">
            <span className="text-3xl" aria-hidden="true">⚠️</span>
          </div>
          <h1 className="text-xl font-bold text-gray-900">
            My best assessment &mdash; I&apos;m not fully certain
          </h1>
          {result.diagnosis && (
            <p className="mt-2 text-lg text-amber-700">{result.diagnosis}</p>
          )}
          <span className="mt-2 rounded-full bg-amber-100 px-3 py-1 text-xs font-medium text-amber-700">
            Confidence: {Math.round(result.confidence * 100)}%
          </span>
        </div>

        <div className="mb-6 rounded-xl border border-amber-200 bg-amber-50 p-4" role="alert">
          <p className="text-sm text-amber-800">
            I see signs that suggest{" "}
            <strong>{result.diagnosis || "a potential issue"}</strong> but
            I&apos;m not confident enough to be sure. Please treat cautiously
            and verify with an expert.
          </p>
        </div>

        <div className="space-y-3">
          {result.what_it_is && (
            <ExpandableSection title="What I think it might be">
              <p className="text-sm text-gray-600">{result.what_it_is}</p>
            </ExpandableSection>
          )}

          {result.treatment_steps && result.treatment_steps.length > 0 && (
            <ExpandableSection title="Suggested treatment (use with caution)">
              <ul className="space-y-1">
                {result.treatment_steps.map((step, i) => (
                  <li
                    key={i}
                    className="flex items-start gap-2 text-sm text-gray-600"
                  >
                    <span className="mt-0.5 text-amber-500">{i + 1}.</span>
                    {step}
                  </li>
                ))}
              </ul>
            </ExpandableSection>
          )}
        </div>

        {/* Expert task */}
        <div className="mt-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
          <p className="text-sm font-medium text-blue-800">
            <span aria-hidden="true">📋 </span>Task created: Get expert verification within 3 days
          </p>
        </div>

        <button
          onClick={() => {
            sessionStorage.removeItem("inspection_data");
            sessionStorage.removeItem("analysis_result");
            sessionStorage.removeItem("diagnosis_result");
            router.push("/home");
          }}
          className="mt-6 w-full rounded-2xl bg-amber-500 py-4 text-center text-base font-semibold text-white shadow-lg"
        >
          I understand &mdash; I&apos;ll treat and monitor
        </button>
      </div>
    );
  }

  // --- VARIANT C: Cannot determine ---
  return (
    <div className="min-h-screen bg-white px-5 py-6">
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-orange-100">
          <span className="text-3xl" aria-hidden="true">🤔</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          I need an expert&apos;s help here
        </h1>
      </div>

      <div className="mb-6 rounded-xl border border-orange-200 bg-orange-50 p-4" role="alert">
        <p className="text-sm text-orange-800">
          I can see your crop is stressed but I&apos;m not confident enough to
          diagnose this safely. Giving you the wrong treatment could make it
          worse.
        </p>
      </div>

      <div className="mb-8 space-y-3">
        <div className="rounded-lg bg-gray-50 p-3">
          <p className="text-xs text-gray-500">Confidence level</p>
          <p className="text-lg font-bold text-gray-800">
            {Math.round(result.confidence * 100)}% — too low to diagnose
          </p>
        </div>
      </div>

      <button
        onClick={() => {
          const inspectionData = sessionStorage.getItem("inspection_data");
          if (inspectionData) {
            const data = JSON.parse(inspectionData);
            sessionStorage.setItem(
              "referral_data",
              JSON.stringify({
                ...data,
                confidence: result.confidence,
              })
            );
          }
          router.push("/inspection/referral");
        }}
        className="w-full rounded-2xl bg-orange-500 py-4 text-center text-base font-semibold text-white shadow-lg"
      >
        Connect me with an expert &rarr;
      </button>

      <button
        onClick={() => {
          sessionStorage.removeItem("inspection_data");
          sessionStorage.removeItem("analysis_result");
          sessionStorage.removeItem("diagnosis_result");
          router.push("/home");
        }}
        className="mt-3 w-full py-3 text-center text-sm text-gray-500 underline"
      >
        Back to my farm
      </button>
    </div>
  );
}
