"use client";

/**
 * AgroSim 2.0 — Receipt scanning UI.
 *
 * Farmer (or judge!) photographs an agri-shop receipt, AI parses it, farmer
 * confirms, AgroSim writes to inventory + accounting.
 *
 * Confidence-tiered display:
 *   - auto (green)   → silently accepted, farmer just taps Confirm
 *   - verify (amber) → highlighted, farmer should glance
 *   - confirm (red)  → must be touched/edited before Confirm
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ParsedReceipt, ReceiptLineItem } from "@/lib/receipts/types";
import {
  ArrowLeft,
  Camera,
  Upload,
  CheckCircle2,
  AlertTriangle,
  Loader2,
} from "lucide-react";

type Stage = "pick" | "scanning" | "review" | "applying" | "done" | "error";

export default function ReceiptScanPage() {
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("pick");
  const [parsed, setParsed] = useState<ParsedReceipt | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [appliedSummary, setAppliedSummary] = useState<{
    itemsAdded: number;
    totalRm: number;
  } | null>(null);

  async function uploadFile(file: File) {
    setStage("scanning");
    setErrorMsg(null);
    try {
      const base64 = await fileToBase64(file);
      const res = await fetch("/api/receipts/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ photoBase64: base64, photoMimeType: file.type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Scan failed");
      setParsed(data.receipt);
      setWarnings(data.warnings || []);
      setStage("review");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStage("error");
    }
  }

  async function applyReceipt() {
    if (!parsed) return;
    setStage("applying");
    try {
      const res = await fetch("/api/receipts/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ receipt: parsed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Apply failed");
      setAppliedSummary({
        itemsAdded: data.itemsAdded ?? parsed.items.length,
        totalRm: data.totalRm ?? parsed.totalAmountRm,
      });
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown error");
      setStage("error");
    }
  }

  function reset() {
    setStage("pick");
    setParsed(null);
    setWarnings([]);
    setErrorMsg(null);
    setAppliedSummary(null);
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">
              Scan receipt
            </h1>
            <p className="text-[11px] leading-none text-stone-500">
              BM / English / handwritten / thermal / phone screenshot — all
              read in seconds.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        {stage === "pick" && <PickStep onFile={uploadFile} />}
        {stage === "scanning" && <ScanningStep />}
        {stage === "review" && parsed && (
          <ReviewStep
            parsed={parsed}
            warnings={warnings}
            onConfirm={applyReceipt}
            onCancel={reset}
          />
        )}
        {stage === "applying" && <ApplyingStep />}
        {stage === "done" && appliedSummary && (
          <DoneStep summary={appliedSummary} onAnother={reset} />
        )}
        {stage === "error" && errorMsg && (
          <ErrorStep message={errorMsg} onRetry={reset} />
        )}
      </main>
    </div>
  );
}

// ─── Stages ─────────────────────────────────────────────────────

function PickStep({ onFile }: { onFile: (f: File) => void }) {
  return (
    <section className="space-y-4 rounded-xl border border-stone-200 bg-white p-4">
      <div className="rounded-lg bg-violet-50 p-3 text-xs text-violet-900">
        <p className="font-medium">Two ways to send a receipt to AgroSim:</p>
        <ul className="mt-1 list-inside list-disc">
          <li>Photograph it here (this page)</li>
          <li>Or upload an existing photo / screenshot from your gallery</li>
        </ul>
      </div>

      <label className="block w-full">
        <span className="block text-sm font-medium mb-2">Take a photo</span>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="hidden"
          id="receipt-camera"
        />
        <label
          htmlFor="receipt-camera"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-300 bg-emerald-50 px-4 py-3 text-emerald-700 cursor-pointer hover:bg-emerald-100"
        >
          <Camera size={18} />
          <span className="text-sm font-medium">Open camera</span>
        </label>
      </label>

      <label className="block w-full">
        <span className="block text-sm font-medium mb-2">Or upload a file</span>
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onFile(f);
          }}
          className="hidden"
          id="receipt-upload"
        />
        <label
          htmlFor="receipt-upload"
          className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white px-4 py-3 text-stone-700 cursor-pointer hover:bg-stone-50"
        >
          <Upload size={18} />
          <span className="text-sm font-medium">Choose image</span>
        </label>
      </label>
    </section>
  );
}

function ScanningStep() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-stone-200 bg-white p-8">
      <Loader2 size={32} className="text-emerald-600 animate-spin" />
      <p className="text-sm text-stone-700">Reading the receipt…</p>
      <p className="text-xs text-stone-500 text-center">
        AgroSim is identifying supplier, items, quantities, and prices.
      </p>
    </section>
  );
}

function ReviewStep({
  parsed,
  warnings,
  onConfirm,
  onCancel,
}: {
  parsed: ParsedReceipt;
  warnings: string[];
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const overallStyle =
    parsed.overallConfidence === "auto"
      ? "bg-emerald-50 border-emerald-200 text-emerald-800"
      : parsed.overallConfidence === "verify"
      ? "bg-amber-50 border-amber-200 text-amber-800"
      : "bg-red-50 border-red-200 text-red-800";

  return (
    <div className="space-y-4">
      <section className={`rounded-xl border p-3 text-sm ${overallStyle}`}>
        <div className="flex items-center justify-between">
          <span className="font-medium uppercase tracking-wide text-xs">
            {parsed.overallConfidence === "auto" && "Looks good"}
            {parsed.overallConfidence === "verify" && "Please glance over"}
            {parsed.overallConfidence === "confirm" && "Please verify carefully"}
          </span>
          <span className="text-xs">
            {Math.round(parsed.overallConfidenceScore * 100)}% confidence
          </span>
        </div>
        {parsed.observations.length > 0 && (
          <p className="mt-1 text-xs italic">{parsed.observations.join(" · ")}</p>
        )}
      </section>

      {warnings.length > 0 && (
        <section className="rounded-xl border border-amber-300 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-amber-900">
            <AlertTriangle size={16} />
            <span className="text-sm font-medium">Some things to verify</span>
          </div>
          <ul className="mt-2 list-inside list-disc text-xs text-amber-800">
            {warnings.map((w, i) => (
              <li key={i}>{w}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4 space-y-3">
        <div className="flex items-center justify-between text-sm">
          <span className="font-medium">{parsed.supplierName ?? "Unknown supplier"}</span>
          <span className="text-stone-500">{parsed.receiptDate ?? "no date"}</span>
        </div>

        <div className="border-t border-stone-100 pt-2">
          <div className="grid grid-cols-12 gap-2 text-[10px] uppercase tracking-wide text-stone-400 pb-1">
            <span className="col-span-6">Item</span>
            <span className="col-span-2 text-right">Qty</span>
            <span className="col-span-4 text-right">Total</span>
          </div>
          <div className="space-y-1.5">
            {parsed.items.map((item, i) => (
              <LineItemRow key={i} item={item} />
            ))}
          </div>
        </div>

        <div className="border-t border-stone-100 pt-2 flex items-center justify-between text-sm font-medium">
          <span>Total</span>
          <span>RM {parsed.totalAmountRm.toFixed(2)}</span>
        </div>
      </section>

      <div className="flex gap-2">
        <button
          onClick={onCancel}
          className="flex-1 rounded-lg border border-stone-300 bg-white px-4 py-3 text-sm"
        >
          Discard
        </button>
        <button
          onClick={onConfirm}
          className="flex-1 rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white hover:bg-emerald-700"
        >
          Looks right — Add to inventory
        </button>
      </div>
    </div>
  );
}

function LineItemRow({ item }: { item: ReceiptLineItem }) {
  const tierBg = (t: ReceiptLineItem["confidence"]["totalRm"]) =>
    t === "auto"
      ? ""
      : t === "verify"
      ? "bg-amber-50"
      : "bg-red-50";
  return (
    <div className={`grid grid-cols-12 gap-2 text-xs items-center rounded px-1 py-1 ${tierBg(item.confidence.totalRm)}`}>
      <div className="col-span-6 min-w-0">
        <p className="font-medium text-stone-800 truncate">{item.itemName}</p>
        {item.brand && (
          <p className="text-[10px] text-stone-400 truncate">{item.brand}</p>
        )}
        <p className="text-[10px] text-stone-400">{item.category}</p>
      </div>
      <div className="col-span-2 text-right text-stone-700">
        {item.quantity} {item.unit}
      </div>
      <div className="col-span-4 text-right text-stone-800">
        RM {item.totalRm.toFixed(2)}
      </div>
    </div>
  );
}

function ApplyingStep() {
  return (
    <section className="flex flex-col items-center gap-3 rounded-xl border border-stone-200 bg-white p-8">
      <Loader2 size={32} className="text-emerald-600 animate-spin" />
      <p className="text-sm">Updating your inventory…</p>
    </section>
  );
}

function DoneStep({
  summary,
  onAnother,
}: {
  summary: { itemsAdded: number; totalRm: number };
  onAnother: () => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-emerald-300 bg-emerald-50 p-4">
      <div className="flex items-center gap-2 text-emerald-800">
        <CheckCircle2 size={20} />
        <span className="font-medium">Receipt logged</span>
      </div>
      <p className="text-sm text-emerald-900">
        Added {summary.itemsAdded} {summary.itemsAdded === 1 ? "item" : "items"} to your
        inventory. Spent RM {summary.totalRm.toFixed(2)} logged for this season&apos;s books.
      </p>
      <button
        onClick={onAnother}
        className="w-full rounded-lg bg-emerald-600 px-4 py-2 text-sm text-white hover:bg-emerald-700"
      >
        Scan another receipt
      </button>
    </section>
  );
}

function ErrorStep({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <section className="space-y-3 rounded-xl border border-red-300 bg-red-50 p-4">
      <div className="flex items-center gap-2 text-red-800">
        <AlertTriangle size={20} />
        <span className="font-medium">Something went wrong</span>
      </div>
      <p className="text-sm text-red-900">{message}</p>
      <button
        onClick={onRetry}
        className="w-full rounded-lg bg-white border border-red-300 px-4 py-2 text-sm text-red-800"
      >
        Try again
      </button>
    </section>
  );
}

// ─── Helpers ───────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const base64 = result.split(",")[1] ?? result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
