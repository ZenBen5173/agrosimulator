"use client";

import { Sparkles } from "lucide-react";

interface AISummaryProps {
  children: string;
  label?: string;
}

export default function AISummary({ children, label }: AISummaryProps) {
  return (
    <div className="rounded-lg border border-gray-200 bg-gradient-to-r from-green-50/50 to-white px-3 py-2.5 flex gap-2.5">
      <Sparkles size={14} className="text-green-500 flex-shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="text-[9px] font-semibold text-green-600 uppercase tracking-wider mb-0.5">{label || "AI Summary"}</p>
        <p className="text-xs text-gray-600 leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
