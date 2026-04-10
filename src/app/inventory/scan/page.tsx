"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Camera,
  Check,
  X,
  Loader2,
  AlertTriangle,
  Package,
} from "lucide-react";
import { useFarmStore } from "@/stores/farmStore";

interface ScannedItem {
  item_name: string;
  item_type: string;
  quantity: number;
  unit: string;
  price_rm: number;
  confidence: "high" | "medium" | "low";
  confirmed: boolean;
}

interface ScanResult {
  scan_id: string;
  supplier_name: string | null;
  receipt_date: string | null;
  items: ScannedItem[];
  total_amount_rm: number;
  overall_confidence: number;
}

const CONFIDENCE_STYLE = {
  high: "bg-green-100 text-green-700",
  medium: "bg-amber-100 text-amber-700",
  low: "bg-red-100 text-red-700",
};

export default function ScanReceiptPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"capture" | "scanning" | "review" | "done">("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [result, setResult] = useState<ScanResult | null>(null);
  const [items, setItems] = useState<ScannedItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !farmId) return;

    // Show preview
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setStep("scanning");
    setError(null);

    try {
      // Convert to base64
      const buffer = await file.arrayBuffer();
      const base64 = btoa(
        new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), "")
      );

      const res = await fetch("/api/inventory/scan-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: farmId,
          photo_base64: base64,
          mime_type: file.type,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Scan failed");
      }

      const data: ScanResult = await res.json();
      setResult(data);
      setItems(data.items.map((i) => ({ ...i, confirmed: i.confidence !== "low" })));
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan receipt");
      setStep("capture");
    }
  };

  const toggleItem = (idx: number) => {
    setItems((prev) =>
      prev.map((item, i) =>
        i === idx ? { ...item, confirmed: !item.confirmed } : item
      )
    );
  };

  const confirmReceipt = async () => {
    if (!farmId || !result) return;
    setSaving(true);

    try {
      const confirmedItems = items
        .filter((i) => i.confirmed)
        .map((i) => ({
          item_name: i.item_name,
          item_type: i.item_type,
          quantity: i.quantity,
          unit: i.unit,
          price_rm: i.price_rm,
          supplier_name: result.supplier_name,
        }));

      await fetch("/api/inventory/confirm-receipt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          farm_id: farmId,
          scan_id: result.scan_id,
          items: confirmedItems,
        }),
      });

      setStep("done");
    } catch {
      setError("Failed to save. Please try again.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      {/* Header */}
      <div className="bg-gradient-to-r from-purple-600 to-indigo-600 text-white px-4 pt-12 pb-6">
        <div className="flex items-center gap-3">
          <button onClick={() => router.back()} className="p-1">
            <ArrowLeft size={24} />
          </button>
          <h1 className="text-xl font-bold">Scan Receipt</h1>
        </div>
        <p className="text-sm opacity-80 mt-2">
          Photo a receipt to auto-update inventory
        </p>
      </div>

      <div className="px-4 mt-4">
        {/* Step: Capture */}
        {step === "capture" && (
          <div className="space-y-4">
            <button
              onClick={() => fileRef.current?.click()}
              className="w-full bg-white rounded-2xl border-2 border-dashed border-gray-300 p-8 flex flex-col items-center gap-3 active:bg-gray-50"
            >
              <div className="w-16 h-16 rounded-full bg-purple-100 flex items-center justify-center">
                <Camera size={32} className="text-purple-600" />
              </div>
              <p className="text-sm font-medium text-gray-700">Tap to photograph receipt</p>
              <p className="text-xs text-gray-400">Supports: printed receipts, handwritten, WhatsApp screenshots</p>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleCapture}
            />
            {error && (
              <div className="bg-red-50 rounded-xl p-4 flex items-start gap-3">
                <AlertTriangle size={20} className="text-red-500 mt-0.5" />
                <p className="text-sm text-red-700">{error}</p>
              </div>
            )}
          </div>
        )}

        {/* Step: Scanning */}
        {step === "scanning" && (
          <div className="space-y-4">
            {preview && (
              <img src={preview} alt="Receipt" className="w-full rounded-xl max-h-48 object-cover" />
            )}
            <div className="bg-white rounded-xl p-6 flex flex-col items-center gap-3">
              <Loader2 size={32} className="text-purple-600 animate-spin" />
              <p className="text-sm font-medium text-gray-700">AI is reading your receipt...</p>
              <p className="text-xs text-gray-400">Extracting items, quantities, and prices</p>
            </div>
          </div>
        )}

        {/* Step: Review */}
        {step === "review" && result && (
          <div className="space-y-4">
            {preview && (
              <img src={preview} alt="Receipt" className="w-full rounded-xl max-h-32 object-cover" />
            )}

            {/* Confidence bar */}
            <div className="bg-white rounded-xl p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Scan Confidence</span>
                <span className="text-sm font-bold text-purple-600">
                  {Math.round(result.overall_confidence * 100)}%
                </span>
              </div>
              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-500 rounded-full transition-all"
                  style={{ width: `${result.overall_confidence * 100}%` }}
                />
              </div>
              {result.supplier_name && (
                <p className="text-xs text-gray-500 mt-2">Supplier: {result.supplier_name}</p>
              )}
              {result.receipt_date && (
                <p className="text-xs text-gray-500">Date: {result.receipt_date}</p>
              )}
            </div>

            {/* Items */}
            <div className="space-y-2">
              <h2 className="text-sm font-semibold text-gray-800">
                Items Found ({items.filter((i) => i.confirmed).length}/{items.length})
              </h2>
              {items.map((item, idx) => (
                <motion.div
                  key={idx}
                  layout
                  className={`bg-white rounded-xl p-4 flex items-center gap-3 border-2 transition-colors ${
                    item.confirmed ? "border-green-200" : "border-gray-100 opacity-60"
                  }`}
                >
                  <button
                    onClick={() => toggleItem(idx)}
                    className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                      item.confirmed ? "bg-green-500" : "bg-gray-200"
                    }`}
                  >
                    {item.confirmed ? (
                      <Check size={16} className="text-white" />
                    ) : (
                      <X size={16} className="text-gray-500" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-800 truncate">{item.item_name}</p>
                    <p className="text-xs text-gray-500">
                      {item.quantity} {item.unit} &middot; RM{item.price_rm.toFixed(2)}
                    </p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${CONFIDENCE_STYLE[item.confidence]}`}>
                    {item.confidence}
                  </span>
                </motion.div>
              ))}
            </div>

            {/* Total */}
            <div className="bg-white rounded-xl p-4 flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700">Total</span>
              <span className="text-lg font-bold text-purple-600">
                RM{items.filter((i) => i.confirmed).reduce((s, i) => s + i.price_rm, 0).toFixed(2)}
              </span>
            </div>

            {/* Confirm button */}
            <button
              onClick={confirmReceipt}
              disabled={saving || items.filter((i) => i.confirmed).length === 0}
              className="w-full bg-green-600 text-white py-3 rounded-xl font-medium disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {saving ? (
                <Loader2 size={18} className="animate-spin" />
              ) : (
                <Check size={18} />
              )}
              Confirm & Update Inventory
            </button>
          </div>
        )}

        {/* Step: Done */}
        {step === "done" && (
          <AnimatePresence>
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-white rounded-2xl p-8 flex flex-col items-center gap-4 mt-8"
            >
              <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                <Package size={32} className="text-green-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-800">Inventory Updated!</h2>
              <p className="text-sm text-gray-500 text-center">
                {items.filter((i) => i.confirmed).length} items have been added to your inventory.
              </p>
              <div className="flex gap-3 w-full mt-2">
                <button
                  onClick={() => router.push("/inventory")}
                  className="flex-1 bg-purple-600 text-white py-2.5 rounded-xl text-sm font-medium"
                >
                  View Inventory
                </button>
                <button
                  onClick={() => { setStep("capture"); setPreview(null); setResult(null); }}
                  className="flex-1 bg-gray-100 text-gray-700 py-2.5 rounded-xl text-sm font-medium"
                >
                  Scan Another
                </button>
              </div>
            </motion.div>
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
