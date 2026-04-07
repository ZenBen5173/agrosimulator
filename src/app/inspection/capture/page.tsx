"use client";

import { Suspense, useCallback, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

interface PhotoSlot {
  file: File | null;
  preview: string | null;
  base64: string | null;
  mimeType: string;
}

const PHOTO_LABELS = [
  { title: "Full Plant", desc: "Step back and capture the whole plant", icon: "📸" },
  { title: "Close-up", desc: "Get close to the affected area", icon: "🔍" },
  { title: "Healthy Comparison", desc: "A nearby healthy plant (optional)", icon: "🌿", optional: true },
];

function CaptureFlow() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const plotId = searchParams.get("plot_id") || "";
  const farmId = searchParams.get("farm_id") || "";
  const cropName = searchParams.get("crop_name") || "";
  const plotLabel = searchParams.get("plot_label") || "";

  const [photos, setPhotos] = useState<PhotoSlot[]>([
    { file: null, preview: null, base64: null, mimeType: "image/jpeg" },
    { file: null, preview: null, base64: null, mimeType: "image/jpeg" },
    { file: null, preview: null, base64: null, mimeType: "image/jpeg" },
  ]);
  const [currentStep, setCurrentStep] = useState(0);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;

      // Create preview
      const preview = URL.createObjectURL(file);

      // Convert to base64
      const arrayBuffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(arrayBuffer).reduce(
          (data, byte) => data + String.fromCharCode(byte),
          ""
        )
      );

      setPhotos((prev) => {
        const updated = [...prev];
        updated[currentStep] = {
          file,
          preview,
          base64,
          mimeType: file.type || "image/jpeg",
        };
        return updated;
      });

      // Auto-advance to next step
      if (currentStep < 2) {
        setTimeout(() => setCurrentStep((s) => Math.min(2, s + 1)), 300);
      }

      // Reset input
      e.target.value = "";
    },
    [currentStep]
  );

  const handleRetake = useCallback(
    (index: number) => {
      setPhotos((prev) => {
        const updated = [...prev];
        if (updated[index].preview) URL.revokeObjectURL(updated[index].preview!);
        updated[index] = { file: null, preview: null, base64: null, mimeType: "image/jpeg" };
        return updated;
      });
      setCurrentStep(index);
    },
    []
  );

  const handleSubmit = useCallback(async () => {
    setUploading(true);

    const photoData = photos
      .filter((p) => p.base64)
      .map((p) => ({
        base64: p.base64!,
        mime_type: p.mimeType,
      }));

    // Upload photos to Supabase Storage
    const photoUrls: string[] = [];
    for (const p of photos) {
      if (!p.file) continue;
      const formData = new FormData();
      formData.append("photo", p.file);
      formData.append("farm_id", farmId);
      formData.append("plot_id", plotId);

      try {
        const res = await fetch("/api/inspection/upload-photo", {
          method: "POST",
          body: formData,
        });
        if (res.ok) {
          const data = await res.json();
          photoUrls.push(data.photo_url);
        }
      } catch {
        // Continue even if upload fails — we have base64 for Gemini
      }
    }

    // Store data in sessionStorage for analysing page
    sessionStorage.setItem(
      "inspection_data",
      JSON.stringify({
        farm_id: farmId,
        plot_id: plotId,
        crop_name: cropName,
        plot_label: plotLabel,
        photo_base64s: photoData,
        photo_urls: photoUrls,
      })
    );

    router.push("/inspection/analysing");
  }, [photos, farmId, plotId, cropName, plotLabel, router]);

  const filledCount = photos.filter((p) => p.base64).length;
  const canSubmit = filledCount >= 2;

  return (
    <div className="min-h-screen bg-white px-5 py-6">
      {/* Header */}
      <div className="mb-6">
        <button
          onClick={() => router.back()}
          className="mb-4 text-sm text-gray-500"
        >
          ← Back
        </button>
        <h1 className="text-xl font-bold text-gray-900">
          Photo {currentStep + 1} of 3
        </h1>
        <div className="mt-2 flex gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className={`h-2 flex-1 rounded-full ${
                photos[i].base64
                  ? "bg-green-500"
                  : i === currentStep
                    ? "bg-green-200"
                    : "bg-gray-200"
              }`}
            />
          ))}
        </div>
      </div>

      {/* Current photo slot */}
      <div className="mb-6">
        <div className="mb-2 flex items-center gap-2">
          <span className="text-xl">{PHOTO_LABELS[currentStep].icon}</span>
          <div>
            <p className="font-medium text-gray-800">
              {PHOTO_LABELS[currentStep].title}
            </p>
            <p className="text-xs text-gray-500">
              {PHOTO_LABELS[currentStep].desc}
              {PHOTO_LABELS[currentStep].optional && (
                <span className="ml-1 text-gray-400">
                  (optional but helps accuracy)
                </span>
              )}
            </p>
          </div>
        </div>

        {photos[currentStep].preview ? (
          <div className="relative">
            <img
              src={photos[currentStep].preview!}
              alt={PHOTO_LABELS[currentStep].title}
              className="h-64 w-full rounded-2xl object-cover shadow"
            />
            <button
              onClick={() => handleRetake(currentStep)}
              className="absolute right-3 bottom-3 rounded-full bg-white/90 px-4 py-2 text-sm font-medium text-gray-700 shadow"
            >
              Retake
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 rounded-2xl border-2 border-dashed border-gray-300 bg-gray-50 py-12">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex h-16 w-16 items-center justify-center rounded-full bg-green-600 text-3xl text-white shadow-lg"
            >
              📷
            </button>
            <p className="text-sm font-medium text-gray-700">Take a photo</p>
            <button
              onClick={() => galleryInputRef.current?.click()}
              className="text-xs text-green-600 underline"
            >
              or choose from gallery
            </button>
          </div>
        )}
      </div>

      {/* Hidden inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handleFileChange}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileChange}
      />

      {/* Photo thumbnails */}
      <div className="mb-6 flex gap-3">
        {photos.map((photo, i) => (
          <button
            key={i}
            onClick={() => setCurrentStep(i)}
            className={`flex h-20 w-20 flex-shrink-0 items-center justify-center rounded-xl border-2 ${
              i === currentStep
                ? "border-green-500"
                : photo.preview
                  ? "border-gray-200"
                  : "border-dashed border-gray-300"
            } overflow-hidden bg-gray-50`}
          >
            {photo.preview ? (
              <img
                src={photo.preview}
                alt={`Photo ${i + 1}`}
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="text-xl text-gray-300">
                {PHOTO_LABELS[i].icon}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!canSubmit || uploading}
        className={`w-full rounded-2xl py-4 text-center text-base font-semibold text-white shadow-lg transition-colors ${
          canSubmit && !uploading
            ? "bg-green-600 hover:bg-green-700"
            : "bg-gray-300"
        }`}
      >
        {uploading
          ? "Uploading photos..."
          : canSubmit
            ? "Analyse my crops →"
            : `Take at least ${2 - filledCount} more photo${2 - filledCount > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}

export default function CapturePage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-green-700">Loading camera...</p>
        </div>
      }
    >
      <CaptureFlow />
    </Suspense>
  );
}
