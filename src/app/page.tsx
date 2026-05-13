"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Stethoscope,
  Receipt,
  Users,
  TrendingUp,
  Sparkles,
  ArrowRight,
  Loader2,
  RotateCcw,
} from "lucide-react";

const FEATURES = [
  {
    icon: Stethoscope,
    title: "Doctor-style diagnosis",
    desc: "Photograph a sick plant. AgroSim rules out alternatives, asks for one confirmation test, and admits when it doesn't know.",
  },
  {
    icon: Receipt,
    title: "Receipt scanning",
    desc: "Photo any agri-shop receipt — BM, English, handwritten, thermal, phone screenshot. Inventory updates in seconds.",
  },
  {
    icon: TrendingUp,
    title: "Anonymous price benchmark",
    desc: "Other pepper / chilli farmers in your district got RM 4.20 this week. You sold at RM 3.80. Now you know.",
  },
  {
    icon: Users,
    title: "Group buying",
    desc: "Five farmers in your kampung want NPK? AgroSim pools the order and gets the bulk price.",
  },
];

const DEMO_EMAIL = "demo@agrosim.app";

export default function LandingPage() {
  const router = useRouter();
  const [entering, setEntering] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [resetMsg, setResetMsg] = useState<string | null>(null);
  const [error, setError] = useState("");

  const handleEnter = async (email: string, startTour = false) => {
    setEntering(email);
    setError("");
    try {
      const res = await fetch("/api/auth/dev-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setEntering(null);
        return;
      }
      const url = startTour ? `${data.callbackUrl}&tour=1` : data.callbackUrl;
      router.push(url);
    } catch {
      setError("Failed to connect. Please try again.");
      setEntering(null);
    }
  };

  const handleResetOnly = async () => {
    setResetting(true);
    setResetMsg(null);
    setError("");
    try {
      const res = await fetch("/api/demo/reset", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Reset failed");
      setResetMsg(
        `Reset complete — ${data.seeded.plots} plots, ${data.seeded.inventoryItems} inventory items, ${data.seeded.diagnoses} diagnoses, ${data.seeded.groupBuys} group buys, ${data.seeded.farmerSales} sales seeded.`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    } finally {
      setResetting(false);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="px-6 pt-16 pb-8">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles size={20} className="text-emerald-600" />
          <span className="text-[10px] font-semibold text-emerald-600 uppercase tracking-widest">
            AgroSim 2.0
          </span>
        </div>

        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          Stop farming alone.
        </h1>
        <p className="text-lg text-gray-500 mt-2 leading-relaxed">
          A silent business partner for Malaysian smallholders.
        </p>

        <p className="text-sm text-gray-400 mt-4 leading-relaxed">
          Three layers, deeply integrated:
          <strong className="text-gray-700"> Care</strong> watches your crops,
          <strong className="text-gray-700"> Books</strong> keeps the receipts,
          <strong className="text-gray-700"> Pact</strong> connects you to
          neighbours so middlemen stop squeezing you.
        </p>

        {/* Demo entry */}
        <button
          onClick={() => handleEnter(DEMO_EMAIL, true)}
          disabled={entering !== null || resetting}
          className="mt-8 w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-4 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:bg-gray-800"
        >
          {entering === DEMO_EMAIL ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Entering…
            </>
          ) : (
            <>
              Enter the demo <ArrowRight size={16} />
            </>
          )}
        </button>

        {/* Reset only — wipes + reseeds the demo account, stays on landing */}
        <button
          onClick={handleResetOnly}
          disabled={entering !== null || resetting}
          className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-3 text-xs font-medium text-amber-800 disabled:opacity-60 hover:bg-amber-100"
        >
          {resetting ? (
            <>
              <Loader2 size={14} className="animate-spin" /> Resetting…
            </>
          ) : (
            <>
              <RotateCcw size={12} /> Reset demo data
            </>
          )}
        </button>
        {resetMsg && (
          <p className="mt-2 text-[11px] text-emerald-700 text-center">{resetMsg}</p>
        )}

        {error && (
          <p className="mt-3 text-xs text-red-500 text-center">{error}</p>
        )}
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-gray-100" />

      {/* Features */}
      <div className="px-6 py-8 space-y-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">
          What you get
        </p>

        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="flex gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-emerald-50 flex items-center justify-center">
                <Icon size={18} className="text-emerald-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">
                  {f.title}
                </p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">
                  {f.desc}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="px-6 pb-8">
        <div className="rounded-lg bg-gray-50 border border-gray-100 px-4 py-3 text-center">
          <p className="text-[10px] text-gray-400">
            Project 2030: MyAI Future Hackathon — Track 1: Padi &amp; Plates
          </p>
          <p className="text-[10px] text-gray-400 mt-0.5">
            Teo Zen Ben &amp; Jeanette Tan En Jie
          </p>
        </div>
      </div>
    </div>
  );
}
