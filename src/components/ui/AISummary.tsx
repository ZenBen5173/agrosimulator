"use client";

import { Sparkles, Zap, AlertTriangle } from "lucide-react";

interface AISummaryProps {
  children: string;
  label?: string;
  model?: string;
  latencyMs?: number;
  source?: "vertex_ai" | "mock" | "static";
}

export default function AISummary({ children, label, model, latencyMs, source }: AISummaryProps) {
  const isMock = source === "mock" || source === "static";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${
      isMock
        ? "border-amber-200 bg-gradient-to-r from-amber-50/50 to-white"
        : "border-gray-200 bg-gradient-to-r from-green-50/50 to-white"
    }`}>
      <div className="flex gap-2.5">
        <Sparkles size={14} className={isMock ? "text-amber-400 flex-shrink-0 mt-0.5" : "text-green-500 flex-shrink-0 mt-0.5"} />
        <div className="flex-1 min-w-0">
          <p className={`text-[9px] font-semibold uppercase tracking-wider mb-0.5 ${isMock ? "text-amber-500" : "text-green-600"}`}>
            {label || "AI Summary"}
          </p>
          <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
        </div>
      </div>
      {/* AI provenance badge */}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-gray-100">
        {isMock ? (
          <div className="flex items-center gap-1 text-[9px] text-amber-500">
            <AlertTriangle size={8} />
            <span>Mock data — AI unavailable</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-[9px] text-gray-400">
            <Zap size={8} className="text-amber-400" />
            <span>{model || "Gemini 2.5 Flash"}</span>
            <span className="text-gray-300">via Vertex AI</span>
          </div>
        )}
        {latencyMs != null && latencyMs > 0 && (
          <span className="text-[9px] text-gray-300">{latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}</span>
        )}
      </div>
    </div>
  );
}
