"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

interface ReferralData {
  farm_id: string;
  plot_id: string;
  crop_name: string;
  plot_label: string;
  confidence: number;
  photo_urls?: string[];
}

export default function ReferralPage() {
  const router = useRouter();
  const [data, setData] = useState<ReferralData | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem("referral_data");
    if (!raw) {
      router.replace("/home");
      return;
    }
    setData(JSON.parse(raw));
  }, [router]);

  if (!data) {
    return (
      <div className="flex h-screen items-center justify-center bg-white">
        <p className="text-gray-500">Loading...</p>
      </div>
    );
  }

  const today = new Date().toLocaleDateString("en-MY", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  const photoCount = data.photo_urls?.length || 2;

  const whatsappMessage = encodeURIComponent(
    `Hello, I am a farmer seeking help with a crop disease I cannot identify.\n\nCrop: ${data.crop_name}\nPlot: ${data.plot_label}\nDate: ${today}\nPhotos taken: ${photoCount}\n\nThe AI agricultural assistant could not confidently diagnose the issue (confidence: ${Math.round(data.confidence * 100)}%). Can you help?`
  );

  // MARDI Agricultural Helpline
  const whatsappUrl = `https://wa.me/60388703410?text=${whatsappMessage}`;

  return (
    <div className="min-h-screen bg-white px-5 py-6">
      {/* Header */}
      <div className="mb-6 flex flex-col items-center text-center">
        <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
          <span className="text-3xl">👨‍🌾</span>
        </div>
        <h1 className="text-xl font-bold text-gray-900">
          We&apos;re preparing your case for an agricultural expert
        </h1>
      </div>

      {/* Case summary */}
      <div className="mb-6 space-y-3">
        <h2 className="text-sm font-bold text-gray-800">Case Summary</h2>
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
          </div>
        </div>
      </div>

      {/* What's being sent */}
      <div className="mb-6">
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
              <span className="text-green-500">✓</span>
              {item}
            </div>
          ))}
        </div>
      </div>

      {/* Expert info */}
      <div className="mb-6 rounded-xl border border-blue-200 bg-blue-50 p-4">
        <p className="text-sm font-medium text-blue-800">
          MARDI / DOA Agricultural Extension Officer
        </p>
        <p className="mt-1 text-xs text-blue-600">
          Typically responds within 24 hours
        </p>
      </div>

      {/* WhatsApp CTA */}
      <a
        href={whatsappUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="mb-3 block w-full rounded-2xl bg-green-600 py-4 text-center text-base font-semibold text-white shadow-lg"
      >
        Send via WhatsApp &rarr;
      </a>

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

      {/* Plot status */}
      <div className="mt-6 rounded-xl bg-orange-50 p-3 text-center">
        <p className="text-xs text-orange-600">
          Plot {data.plot_label} is flagged orange &mdash; will clear when
          expert responds
        </p>
      </div>
    </div>
  );
}
