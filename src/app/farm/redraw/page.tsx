"use client";

import dynamic from "next/dynamic";

const FarmRedrawMap = dynamic(() => import("@/components/FarmRedrawMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen items-center justify-center bg-gray-900">
      <p className="text-green-400">Loading map...</p>
    </div>
  ),
});

export default function RedrawPage() {
  return <FarmRedrawMap />;
}
