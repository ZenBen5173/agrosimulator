"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  CalendarCheck,
  MessageCircle,
  ScanLine,
  FileText,
  Sparkles,
  ArrowRight,
  Loader2,
} from "lucide-react";

const FEATURES = [
  {
    icon: CalendarCheck,
    title: "Morning Briefing",
    desc: "Tasks, prep list, weather, and alerts — everything before you leave home.",
  },
  {
    icon: MessageCircle,
    title: "AI Chat-to-Action",
    desc: "Tell the AI what you need. It creates tasks, orders supplies, and updates records.",
  },
  {
    icon: ScanLine,
    title: "Scan Any Document",
    desc: "Photo a receipt or bill. AI reads it, updates inventory, files the expense.",
  },
  {
    icon: FileText,
    title: "Full Business Suite",
    desc: "Sales orders, invoices, inventory, equipment, depreciation — like AutoCount but AI-powered.",
  },
];


export default function LandingPage() {
  const router = useRouter();
  const [entering, setEntering] = useState<string | null>(null);
  const [error, setError] = useState("");

  const [loggedInUser, setLoggedInUser] = useState<string | null>(null);

  // Check if already logged in
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) setLoggedInUser(user.email || null);
    });
  }, []);

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
      if (data.error) { setError(data.error); setEntering(null); return; }
      // Pass tour flag through callback URL
      const url = startTour ? `${data.callbackUrl}&tour=1` : data.callbackUrl;
      router.push(url);
    } catch {
      setError("Failed to connect. Please try again.");
      setEntering(null);
    }
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Hero */}
      <div className="px-6 pt-16 pb-8">
        <div className="flex items-center gap-2 mb-6">
          <Sparkles size={20} className="text-green-600" />
          <span className="text-[10px] font-semibold text-green-600 uppercase tracking-widest">AI-Powered Farm Management</span>
        </div>

        <h1 className="text-4xl font-bold text-gray-900 leading-tight">
          AgroSim
        </h1>
        <p className="text-lg text-gray-500 mt-2 leading-relaxed">
          Built for Malaysian smallholder farmers.
        </p>

        <p className="text-sm text-gray-400 mt-4 leading-relaxed">
          Replace your notebook, receipt box, weather app, and spreadsheet — all in one AI-powered app.
        </p>

        {loggedInUser ? (
          <>
            <button
              onClick={() => router.push("/home?tour=1")}
              className="mt-8 w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-4 text-sm font-semibold text-white hover:bg-gray-800"
            >
              Continue as {loggedInUser.split("@")[0]} <ArrowRight size={16} />
            </button>
            <button
              onClick={async () => {
                const supabase = createClient();
                await supabase.auth.signOut();
                setLoggedInUser(null);
              }}
              className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-xs font-medium text-gray-500 hover:bg-gray-50"
            >
              Sign out &amp; switch account
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => handleEnter("demo@agrosim.app", true)}
              disabled={entering !== null}
              className="mt-8 w-full flex items-center justify-center gap-2 rounded-xl bg-gray-900 py-4 text-sm font-semibold text-white disabled:opacity-60 transition-all hover:bg-gray-800"
            >
              {entering === "demo@agrosim.app" ? (
                <><Loader2 size={16} className="animate-spin" /> Entering...</>
              ) : (
                <>Enter App <ArrowRight size={16} /></>
              )}
            </button>

            <button
              onClick={() => handleEnter("dev@agrosim.app")}
              disabled={entering !== null}
              className="mt-2 w-full flex items-center justify-center gap-2 rounded-xl border border-gray-200 py-3 text-xs font-medium text-gray-500 disabled:opacity-60 hover:bg-gray-50"
            >
              {entering === "dev@agrosim.app" ? (
                <><Loader2 size={14} className="animate-spin" /> Entering...</>
              ) : (
                <>Dev / Testing Account</>
              )}
            </button>
          </>
        )}

        {error && <p className="mt-3 text-xs text-red-500 text-center">{error}</p>}
      </div>

      {/* Divider */}
      <div className="mx-6 border-t border-gray-100" />

      {/* Features */}
      <div className="px-6 py-8 space-y-4">
        <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-widest">What You Get</p>

        {FEATURES.map((f) => {
          const Icon = f.icon;
          return (
            <div key={f.title} className="flex gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-lg bg-gray-50 flex items-center justify-center">
                <Icon size={18} className="text-gray-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-gray-800">{f.title}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{f.desc}</p>
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
