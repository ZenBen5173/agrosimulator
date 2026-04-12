"use client";

import { Sparkles, Zap } from "lucide-react";

interface AISummaryProps {
  children: string;
  label?: string;
  model?: string;
  latencyMs?: number;
}

export default function AISummary({ children, label, model, latencyMs }: AISummaryProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gradient-to-r from-green-50/50 to-white px-3 py-2.5">
      <div className="flex gap-2.5">
        <Sparkles size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
        <div className="flex-1 min-w-0">
          <p className="text-[9px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">{label || "AI Summary"}</p>
          <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
        </div>
      </div>
      {/* AI provenance badge */}
      <div className="flex items-center gap-2 mt-2 pt-1.5 border-t border-gray-100">
        <div className="flex items-center gap-1 text-[9px] text-gray-400">
          <Zap size={8} className="text-amber-400" />
          <span>{model || "Gemini 2.5 Flash"}</span>
          <span className="text-gray-300">via Vertex AI</span>
        </div>
        {latencyMs != null && latencyMs > 0 && (
          <span className="text-[9px] text-gray-300">{latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`}</span>
        )}
      </div>
    </div>
  );
}
