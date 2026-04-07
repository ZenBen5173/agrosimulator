"use client";

import dynamic from "next/dynamic";

const FarmDrawMap = dynamic(() => import("@/components/FarmDrawMap"), {
  ssr: false,
  loading: () => (
    <div className="flex h-screen w-screen items-center justify-center bg-green-50">
      <p className="text-lg text-green-700">Loading map...</p>
    </div>
  ),
});

export default function MapPage() {
  return <FarmDrawMap />;
}
