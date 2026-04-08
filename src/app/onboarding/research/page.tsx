"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const MESSAGES = [
  "Analysing your location...",
  "Checking soil profiles for this district...",
  "Reviewing nearby irrigation zones...",
  "Preparing your farm details...",
];

export default function ResearchPage() {
  const [messageIndex, setMessageIndex] = useState(0);
  const [error, setError] = useState("");
  const router = useRouter();
  const supabase = createClient();
  const calledRef = useRef(false);

  // Cycle messages
  useEffect(() => {
    const interval = setInterval(() => {
      setMessageIndex((i) => (i + 1) % MESSAGES.length);
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch farm and call research API
  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    async function doResearch() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      // Get latest unfinished farm
      const { data: farms } = await supabase
        .from("farms")
        .select("id")
        .eq("onboarding_done", false)
        .order("created_at", { ascending: false })
        .limit(1);

      if (!farms || farms.length === 0) {
        setError("No farm found. Please draw your farm first.");
        return;
      }

      const farmId = farms[0].id;

      const res = await fetch("/api/onboarding/research-farm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ farm_id: farmId }),
      });

      if (!res.ok) {
        setError("Something went wrong. Tap to try again.");
        return;
      }

      router.push(`/onboarding/details?farm_id=${farmId}`);
    }

    doResearch();
  }, [supabase, router]);

  function handleRetry() {
    setError("");
    calledRef.current = false;
    // re-trigger
    window.location.reload();
  }

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-green-50 px-6">
      {error ? (
        <div className="text-center" role="alert">
          <p className="text-lg text-red-600">{error}</p>
          <button
            onClick={handleRetry}
            className="mt-4 rounded-xl bg-green-600 px-8 py-3 text-lg font-semibold text-white"
          >
            Try again
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-8">
          {/* Animated plant */}
          <div className="relative flex h-32 w-32 items-center justify-center">
            <div className="absolute h-full w-full animate-ping rounded-full bg-green-200 opacity-30" />
            <div className="absolute h-24 w-24 animate-pulse rounded-full bg-green-100" />
            <span className="relative text-6xl">🌱</span>
          </div>

          {/* Cycling message */}
          <p
            key={messageIndex}
            role="status"
            aria-live="polite"
            className="animate-fade-in text-center text-lg font-medium text-green-800"
          >
            {MESSAGES[messageIndex]}
          </p>
        </div>
      )}
    </div>
  );
}
