"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Check, X, FileText, ArrowRight } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import { useFarmStore } from "@/stores/farmStore";

interface ScannedItem {
  item_name: string;
  item_type: string;
  quantity: number;
  unit: string;
  unit_price_rm: number;
  total_rm: number;
}

interface ScanResult {
  document_type: string;
  direction: "purchase" | "sale";
  contact_name: string | null;
  contact_phone: string | null;
  document_number: string | null;
  document_date: string | null;
  due_date: string | null;
  items: ScannedItem[];
  total_amount_rm: number;
  notes: string | null;
  confidence: number;
}

interface ProcessResult {
  created: { type: string; number: string; id: string }[];
  total: number;
  direction: string;
}

const DOC_TYPE_LABELS: Record<string, string> = {
  supplier_invoice: "Supplier Invoice / Bill",
  supplier_receipt: "Supplier Receipt",
  supplier_quotation: "Supplier Quotation",
  delivery_order: "Delivery Order",
  purchase_order: "Purchase Order",
  customer_invoice: "Customer Invoice",
  customer_receipt: "Customer Receipt",
  unknown: "Unknown Document",
};

export default function AccountsScanPage() {
  const router = useRouter();
  const farmId = useFarmStore((s) => s.farm?.id);
  const fileRef = useRef<HTMLInputElement>(null);

  const [step, setStep] = useState<"capture" | "scanning" | "review" | "processing" | "done">("capture");
  const [preview, setPreview] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<ScanResult | null>(null);
  const [processResult, setProcessResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleCapture = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !farmId) return;

    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(file);

    setStep("scanning");
    setError(null);

    try {
      const buffer = await file.arrayBuffer();
      const base64 = btoa(new Uint8Array(buffer).reduce((s, b) => s + String.fromCharCode(b), ""));

      const res = await fetch("/api/documents/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farmId, photo_base64: base64, mime_type: file.type }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Scan failed");

      const data: ScanResult = await res.json();
      setScanResult(data);
      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to scan");
      setStep("capture");
    }
  };

  const handleProcess = async () => {
    if (!farmId || !scanResult) return;
    setStep("processing");

    try {
      const res = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farmId, ...scanResult }),
      });

      if (!res.ok) throw new Error((await res.json()).error || "Processing failed");

      const data: ProcessResult = await res.json();
      setProcessResult(data);
      setStep("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process");
      setStep("review");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-24">
      <PageHeader
        title="Scan Document"
        breadcrumbs={[{ label: "Accounts", href: "/dashboard" }, { label: "Scan" }]}
      />

      <div className="px-4 pt-3">
        {/* Capture */}
        {step === "capture" && (
          <div className="space-y-3">
            <div className="py-1">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-0.5">AI Accounts Assistant</p>
              <p className="text-xs text-gray-600 leading-relaxed">
                Photograph any business document — invoice, receipt, quotation, delivery order. AI will identify it, extract all data, and create the correct records automatically.
              </p>
            </div>

            <button onClick={() => fileRef.current?.click()}
              className="w-full rounded-lg border-2 border-dashed border-gray-300 bg-white p-8 flex flex-col items-center gap-3">
              <Camera size={32} className="text-gray-400" />
              <p className="text-xs font-medium text-gray-600">Tap to photograph document</p>
              <p className="text-[10px] text-gray-400">Supports: invoices, receipts, quotations, DOs, POs</p>
            </button>

            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleCapture} />

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}
          </div>
        )}

        {/* Scanning */}
        {step === "scanning" && (
          <div className="space-y-3 pt-4">
            {preview && <img src={preview} alt="Document" className="w-full rounded-lg max-h-40 object-cover" />}
            <div className="flex flex-col items-center gap-2 py-6">
              <Loader2 size={24} className="text-green-600 animate-spin" />
              <p className="text-xs text-gray-600">AI is reading your document...</p>
              <p className="text-[10px] text-gray-400">Identifying type, extracting items and amounts</p>
            </div>
          </div>
        )}

        {/* Review */}
        {step === "review" && scanResult && (
          <div className="space-y-3">
            {preview && <img src={preview} alt="Document" className="w-full rounded-lg max-h-32 object-cover" />}

            {/* Document type + confidence */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Detected Document</span>
                <span className="text-[10px] text-gray-500">{Math.round(scanResult.confidence * 100)}% confidence</span>
              </div>
              <div className="divide-y divide-gray-50">
                <div className="flex justify-between px-3 py-2 text-xs">
                  <span className="text-gray-400">Type</span>
                  <span className="text-gray-800 font-medium">{DOC_TYPE_LABELS[scanResult.document_type] || scanResult.document_type}</span>
                </div>
                <div className="flex justify-between px-3 py-2 text-xs">
                  <span className="text-gray-400">Direction</span>
                  <span className={`font-medium ${scanResult.direction === "purchase" ? "text-red-500" : "text-green-600"}`}>
                    {scanResult.direction === "purchase" ? "Purchase (Expense)" : "Sale (Income)"}
                  </span>
                </div>
                {scanResult.contact_name && (
                  <div className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-gray-400">{scanResult.direction === "purchase" ? "Supplier" : "Customer"}</span>
                    <span className="text-gray-800">{scanResult.contact_name}</span>
                  </div>
                )}
                {scanResult.document_date && (
                  <div className="flex justify-between px-3 py-2 text-xs">
                    <span className="text-gray-400">Date</span>
                    <span className="text-gray-800">{scanResult.document_date}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Line items */}
            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              <div className="px-3 py-2 border-b border-gray-100">
                <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">Items Extracted</span>
              </div>
              {scanResult.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between px-3 py-2 border-b border-gray-50 last:border-0 text-xs">
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-800 font-medium">{item.item_name}</p>
                    <p className="text-[10px] text-gray-400">{item.quantity} {item.unit} x RM{item.unit_price_rm.toFixed(2)}</p>
                  </div>
                  <span className="text-gray-800 font-medium flex-shrink-0">RM{item.total_rm.toFixed(2)}</span>
                </div>
              ))}
              <div className="flex justify-between px-3 py-2 border-t border-gray-200 text-xs font-bold">
                <span className="text-gray-600">Total</span>
                <span className="text-gray-900">RM{scanResult.total_amount_rm.toFixed(2)}</span>
              </div>
            </div>

            {/* What will be created */}
            <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
              <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider mb-1">Will Create</p>
              <p className="text-xs text-gray-600">
                {scanResult.direction === "purchase"
                  ? scanResult.document_type === "supplier_quotation"
                    ? "Request Quotation (RQ)"
                    : "Purchase Order + Goods Received Note + Purchase Invoice + Financial Record + Inventory Update"
                  : "Sales Order + Delivery Order + Invoice + Financial Record + Inventory Update"
                }
              </p>
            </div>

            {/* Actions */}
            <div className="flex gap-2">
              <button onClick={() => { setStep("capture"); setPreview(null); setScanResult(null); }}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg border border-gray-200 bg-white py-2.5 text-xs text-gray-600">
                <X size={14} /> Rescan
              </button>
              <button onClick={handleProcess}
                className="flex-1 flex items-center justify-center gap-1 rounded-lg bg-green-600 py-2.5 text-xs text-white font-medium">
                <Check size={14} /> Confirm & Process
              </button>
            </div>

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
            )}
          </div>
        )}

        {/* Processing */}
        {step === "processing" && (
          <div className="flex flex-col items-center gap-2 py-12">
            <Loader2 size={24} className="text-green-600 animate-spin" />
            <p className="text-xs text-gray-600">Creating documents and updating records...</p>
          </div>
        )}

        {/* Done */}
        {step === "done" && processResult && (
          <div className="space-y-3 pt-4">
            <div className="flex flex-col items-center gap-2 py-4">
              <div className="w-12 h-12 rounded-full bg-green-100 flex items-center justify-center">
                <Check size={24} className="text-green-600" />
              </div>
              <p className="text-sm font-semibold text-gray-900">Documents Created</p>
              <p className="text-xs text-gray-500">
                {processResult.created.length} documents for RM{processResult.total.toFixed(2)}
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
              {processResult.created.map((doc) => (
                <button key={doc.id} onClick={() => router.push(`/business/${doc.type === "Bill" ? "purchase_invoice" : doc.type === "PO" ? "purchase_order" : doc.type === "GRN" ? "grn" : doc.type === "RQ" ? "rfq" : doc.type === "SO" ? "sales_order" : doc.type === "DO" ? "delivery_order" : doc.type === "INV" ? "sales_invoice" : doc.type.toLowerCase()}/${doc.id}`)}
                  className="w-full flex items-center justify-between px-3 py-2.5 border-b border-gray-50 last:border-0 hover:bg-gray-50/50 text-left">
                  <div className="flex items-center gap-2">
                    <FileText size={14} className="text-gray-400" />
                    <div>
                      <span className="text-xs font-medium text-gray-800">{doc.number}</span>
                      <span className="text-[10px] text-gray-400 ml-1.5">{doc.type}</span>
                    </div>
                  </div>
                  <ArrowRight size={12} className="text-gray-300" />
                </button>
              ))}
            </div>

            <div className="flex gap-2">
              <button onClick={() => router.push("/dashboard")}
                className="flex-1 rounded-lg border border-gray-200 bg-white py-2.5 text-xs text-gray-600 font-medium">
                Back to Accounts
              </button>
              <button onClick={() => { setStep("capture"); setPreview(null); setScanResult(null); setProcessResult(null); }}
                className="flex-1 rounded-lg bg-green-600 py-2.5 text-xs text-white font-medium">
                Scan Another
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
