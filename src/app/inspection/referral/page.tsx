"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

interface ReferralData {
  farm_id: string;
  plot_id: string;
  crop_name: string;
  plot_label: string;
  confidence: number;
  photo_urls?: string[];
}

interface ReferralRecord {
  id: string;
  status: "pending" | "responded" | "resolved";
  expert_response: string | null;
  created_at: string;
}

const STATUS_CONFIG = {
  pending: {
    label: "Pending",
    bg: "bg-amber-100",
    text: "text-amber-700",
    dot: "bg-amber-400",
    description: "Waiting for expert to review your case",
  },
  responded: {
    label: "Responded",
    bg: "bg-blue-100",
    text: "text-blue-700",
    dot: "bg-blue-400",
    description: "Expert has reviewed and responded",
  },
  resolved: {
    label: "Resolved",
    bg: "bg-green-100",
    text: "text-green-700",
    dot: "bg-green-400",
    description: "Case closed",
  },
};

export default function ReferralPage() {
  const router = useRouter();
  const [data, setData] = useState<ReferralData | null>(null);
  const [referral, setReferral] = useState<ReferralRecord | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const today = new Date().toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  // Save referral to database
  const saveReferral = useCallback(
    async (referralData: ReferralData) => {
      setSaving(true);
      setError(null);
      try {
        const res = await fetch("/api/referral", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plot_id: referralData.plot_id,
            case_package_json: {
              crop_name: referralData.crop_name,
              plot_label: referralData.plot_label,
              confidence: referralData.confidence,
              photo_count: referralData.photo_urls?.length || 0,
              referred_date: today,
            },
          }),
        });

        if (!res.ok) {
          throw new Error("Failed to save referral");
        }

        const result = await res.json();
        setReferral(result.referral);
        setSaved(true);
      } catch (err) {
        console.error("Save referral error:", err);
        setError("Could not save referral. Your case details are still available below.");
      } finally {
        setSaving(false);
      }
    },
    [today]
  );

  useEffect(() => {
    const raw = sessionStorage.getItem("referral_data");
    if (!raw) {
      router.replace("/home");
      return;
    }
    const parsed: ReferralData = JSON.parse(raw);
    setData(parsed);
    saveReferral(parsed);
  }, [router, saveReferral]);

  // Check referral status
  const checkStatus = async () => {
    if (!referral) return;
    setChecking(true);
    try {
      const res = await fetch("/api/referral");
      if (res.ok) {
        const result = await res.json();
        const match = (result.referrals || []).find(
          (r: ReferralRecord) => r.id === referral.id
        );
        if (match) {
          setReferral(match);
        }
      }
    } catch {
      // Silently fail status check
    } finally {
      setChecking(false);
    }
  };

  // Copy case summary to clipboard
  const copyCaseSummary = async () => {
    if (!data) return;
    const photoCount = data.photo_urls?.length || 0;
    const summary = [
      "=== CROP DISEASE CASE SUMMARY ===",
      "",
      `Crop: ${data.crop_name}`,
      `Plot: ${data.plot_label}`,
      `Date: ${today}`,
      `Photos taken: ${photoCount}`,
      `AI confidence: ${Math.round(data.confidence * 100)}%`,
      "",
      "The AI agricultural assistant could not confidently diagnose this issue.",
      "Expert review is requested.",
      "",
      referral ? `Referral ID: ${referral.id}` : "",
      referral ? `Status: ${referral.status}` : "",
    ]
      .filter(Boolean)
      .join("\n");

    try {
      await navigator.clipboard.writeText(summary);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      const textarea = document.createElement("textarea");
      textarea.value = summary;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const photoCount = data.photo_urls?.length || 2;
  const currentStatus = referral?.status || "pending";
  const statusConfig = STATUS_CONFIG[currentStatus];

  const whatsappMessage = encodeURIComponent(
    `Hello, I am a farmer seeking help with a crop disease I cannot identify.\n\nCrop: ${data.crop_name}\nPlot: ${data.plot_label}\nDate: ${today}\nPhotos taken: ${photoCount}\n\nThe AI agricultural assistant could not confidently diagnose the issue (confidence: ${Math.round(data.confidence * 100)}%). Can you help?`
  );

  const emailSubject = encodeURIComponent(
    `Crop Disease Referral — ${data.crop_name} (${data.plot_label})`
  );
  const emailBody = encodeURIComponent(
    `Dear Sir/Madam,\n\nI am a farmer seeking help with a crop disease I cannot identify.\n\nCrop: ${data.crop_name}\nPlot: ${data.plot_label}\nDate: ${today}\nPhotos taken: ${photoCount}\nAI Confidence: ${Math.round(data.confidence * 100)}%\n\nThe AI agricultural assistant could not confidently diagnose this issue. Could you please assist?\n\nThank you.`
  );

  // MARDI Agricultural Helpline
  const whatsappUrl = `https://wa.me/60388703410?text=${whatsappMessage}`;
  const emailUrl = `mailto:agriculture@mardi.gov.my?subject=${emailSubject}&body=${emailBody}`;

  return (
    <div className="min-h-screen bg-white px-5 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <span className="text-3xl">&#x1F468;&#x200D;&#x1F33E;</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          {saving
            ? "Saving your case..."
            : saved
              ? "Case submitted to expert"
              : "Preparing your case"}
        </h1>
        {saving && (
          <p className="mt-2 text-sm text-gray-500">
            Saving referral and updating plot status...
          </p>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 p-3">
          <p className="text-xs text-red-600">{error}</p>
        </div>
      )}

      {/* Plot warning status */}
      <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 p-3">
        <div className="flex items-center gap-2">
          <span className="flex h-3 w-3 rounded-full bg-orange-400" />
          <p className="text-sm font-medium text-orange-700">
            Plot {data.plot_label} — Warning level set to Orange
          </p>
        </div>
        <p className="mt-1 pl-5 text-xs text-orange-600">
          Will clear when expert responds and case is resolved
        </p>
      </div>

      {/* Referral status tracker */}
      {saved && referral && (
        <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-bold text-gray-800">Referral Status</h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${statusConfig.bg} ${statusConfig.text}`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${statusConfig.dot}`} />
              {statusConfig.label}
            </span>
          </div>

          {/* Progress steps */}
          <div className="flex items-center gap-1">
            {(["pending", "responded", "resolved"] as const).map((step, i) => {
              const stepOrder = { pending: 0, responded: 1, resolved: 2 };
              const currentOrder = stepOrder[currentStatus];
              const thisOrder = stepOrder[step];
              const isActive = thisOrder <= currentOrder;
              return (
                <div key={step} className="flex flex-1 items-center gap-1">
                  <div
                    className={`h-2 flex-1 rounded-full ${isActive ? "bg-green-400" : "bg-gray-200"}`}
                  />
                  {i < 2 && <div className="w-0.5" />}
                </div>
              );
            })}
          </div>
          <div className="mt-1.5 flex justify-between text-[10px] text-gray-400">
            <span>Pending</span>
            <span>Responded</span>
            <span>Resolved</span>
          </div>

          <p className="mt-3 text-xs text-gray-500">
            {statusConfig.description}
          </p>

          {referral.expert_response && (
            <div className="mt-3 rounded-lg border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-medium text-blue-700">Expert Response:</p>
              <p className="mt-1 text-xs text-blue-600">
                {referral.expert_response}
              </p>
            </div>
          )}

          {/* Check status button */}
          <button
            onClick={checkStatus}
            disabled={checking}
            className="mt-3 w-full rounded-xl border border-gray-200 py-2.5 text-center text-xs font-medium text-gray-600 transition hover:bg-gray-100 disabled:opacity-50"
          >
            {checking ? "Checking..." : "Check Referral Status"}
          </button>
        </div>
      )}

      {/* Case summary */}
      <div className="mb-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-gray-800">Case Summary</h2>
          <button
            onClick={copyCaseSummary}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 transition hover:bg-gray-50"
          >
            {copied ? "Copied!" : "Copy Summary"}
          </button>
        </div>
        <div className="rounded-xl bg-gray-50 p-4">
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <p className="text-xs text-gray-500">Plot</p>
              <p className="font-medium text-gray-800">{data.plot_label}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Crop</p>
              <p className="font-medium text-gray-800">{data.crop_name}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Photos</p>
              <p className="font-medium text-gray-800">
                {photoCount} inspection photos
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Date</p>
              <p className="font-medium text-gray-800">{today}</p>
            </div>
            <div className="col-span-2">
              <p className="text-xs text-gray-500">AI Confidence</p>
              <p className="font-medium text-gray-800">
                {Math.round(data.confidence * 100)}% — too low to diagnose
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* What's being sent */}
      <div className="mb-4">
        <h2 className="mb-3 text-sm font-bold text-gray-800">
          What&apos;s being sent
        </h2>
        <div className="space-y-2">
          {[
            "Inspection photos",
            "Your answers to follow-up questions",
            "Farm location",
            "Crop growth history",
          ].map((item, i) => (
            <div
              key={i}
              className="flex items-center gap-2 text-sm text-gray-600"
            >
              <span className="text-green-500">&#x2713;</span>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Expert info */}
      <div className="mb-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-800">
          MARDI / DOA Agricultural Extension Officer
        </p>
        <p className="mt-1 text-xs text-blue-600">
          Typically responds within 24 hours
        </p>
      </div>

      {/* Contact options */}
      <div className="mb-3 space-y-3">
        {/* WhatsApp CTA */}
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-green-600 py-4 text-center text-base font-semibold text-white shadow-lg"
        >
          Send via WhatsApp &rarr;
        </a>

        {/* Email CTA */}
        <a
          href={emailUrl}
          className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-blue-500 py-3.5 text-center text-sm font-semibold text-blue-600 transition hover:bg-blue-50"
        >
          Send via Email (agriculture@mardi.gov.my)
        </a>
      </div>

      <button
        onClick={() => {
          sessionStorage.removeItem("inspection_data");
          sessionStorage.removeItem("analysis_result");
          sessionStorage.removeItem("diagnosis_result");
          sessionStorage.removeItem("referral_data");
          router.push("/home");
        }}
        className="w-full py-3 text-center text-sm text-gray-500"
      >
        Got it &mdash; back to my farm
      </button>
    </div>
  );
}
