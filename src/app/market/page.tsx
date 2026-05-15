"use client";

/**
 * AgroSim 2.1 — Market prices surface.
 *
 * Two sections:
 *   1. Anonymous district price benchmark — the killer line
 *   2. Log a sale (feeds the benchmark for everyone)
 *
 * Group buys lived here in 2.0 but moved to /group-buy in 2.1 to live
 * alongside the chat-to-action restock flow. See /api/group-buy and
 * src/app/group-buy. Anyone hitting /market for group buys gets a
 * pointer at the bottom of this page.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, TrendingUp, Users, Loader2 } from "lucide-react";
import type { CropName } from "@/lib/diagnosis/types";
import type { PriceBenchmarkResponse } from "@/lib/pact/types";
import { createClient } from "@/lib/supabase/client";

const CROPS: { value: CropName; label: string }[] = [
  { value: "chilli", label: "Pepper / Chilli (lada / cili)" },
  { value: "paddy", label: "Paddy (padi)" },
  { value: "kangkung", label: "Kangkung" },
  { value: "banana", label: "Banana (pisang)" },
  { value: "corn", label: "Corn (jagung)" },
  { value: "sweet_potato", label: "Sweet potato (keledek)" },
];

const DISTRICTS = [
  "Cameron Highlands",
  "Kedah",
  "Perak",
  "Selangor",
  "Johor",
  "Kelantan",
  "Pahang",
  "Sabah",
  "Sarawak",
];

export default function PactMarketPage() {
  const router = useRouter();
  const [crop, setCrop] = useState<CropName>("chilli");
  const [district, setDistrict] = useState<string>("Cameron Highlands");
  const [farmerId, setFarmerId] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<PriceBenchmarkResponse | null>(null);
  const [loadingBenchmark, setLoadingBenchmark] = useState(false);

  // Try to read user's district from their farm row on mount
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      setFarmerId(user.id);
      const { data: farm } = await supabase
        .from("farms")
        .select("district")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm?.district && DISTRICTS.includes(farm.district)) {
        setDistrict(farm.district);
      }
    });
  }, []);

  // Load benchmark when crop or district changes.
  // The lint rule against synchronous setState in an effect body is overly
  // strict for "set loading flag, then fire fetch" — that's the canonical
  // pattern. Disabling locally to keep the file readable.
  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingBenchmark(true);
    const params = new URLSearchParams({ crop, district });
    if (farmerId) params.set("farmer_id", farmerId);
    fetch(`/api/pact/benchmark?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setBenchmark(d); })
      .catch(() => { if (!cancelled) setBenchmark(null); })
      .finally(() => { if (!cancelled) setLoadingBenchmark(false); });
    return () => { cancelled = true; };
  }, [crop, district, farmerId]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Market prices</h1>
            <p className="text-[11px] leading-none text-stone-500">
              Anonymous district benchmark · log what you sold.
            </p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-4 py-6 space-y-8">
        {/* ── Filters (compact, less prominent than content cards) ── */}
        <section>
          <SectionLabel>Showing</SectionLabel>
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-stone-500">District</span>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-stone-500">Crop</span>
              <select
                value={crop}
                onChange={(e) => setCrop(e.target.value as CropName)}
                className="w-full rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm"
              >
                {CROPS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* ── Anonymous district price (the killer line) ── */}
        <section>
          <SectionLabel>Anonymous district price</SectionLabel>
          <BenchmarkCard loading={loadingBenchmark} benchmark={benchmark} />
        </section>

        {/* ── Log a sale (your action) ── */}
        {farmerId && (
          <section>
            <SectionLabel>Your action</SectionLabel>
            <LogSaleCard
              crop={crop}
              district={district}
              onSaved={() => {
                const params = new URLSearchParams({ crop, district });
                if (farmerId) params.set("farmer_id", farmerId);
                fetch(`/api/pact/benchmark?${params.toString()}`)
                  .then((r) => r.json())
                  .then((d) => setBenchmark(d))
                  .catch(() => {});
              }}
            />
          </section>
        )}

        {/* Group buys live on their own page now (chat-to-action flow). */}
        <Link
          href="/group-buy"
          className="block rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-center text-sm font-medium text-emerald-800 hover:border-emerald-400"
        >
          <Users size={16} className="mx-auto mb-1 text-emerald-700" />
          Open group buys in {district}
        </Link>
      </main>
    </div>
  );
}

// ─── Section helpers ────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-2 px-1 text-[10px] font-semibold uppercase tracking-widest text-stone-400">
      {children}
    </p>
  );
}

// ─── Components ─────────────────────────────────────────────────

function BenchmarkCard({
  loading,
  benchmark,
}: {
  loading: boolean;
  benchmark: PriceBenchmarkResponse | null;
}) {
  if (loading) {
    return (
      <section className="rounded-xl border border-stone-200 bg-white p-4 flex items-center justify-center text-sm text-stone-500">
        <Loader2 size={18} className="animate-spin mr-2" />
        Loading district benchmark…
      </section>
    );
  }
  if (!benchmark) return null;

  const colour =
    benchmark.comparison === "above_median"
      ? "bg-emerald-50 border-emerald-300 text-emerald-900"
      : benchmark.comparison === "below_median"
      ? "bg-amber-50 border-amber-300 text-amber-900"
      : "bg-stone-50 border-stone-200 text-stone-700";

  return (
    <section className={`rounded-xl border p-4 space-y-2 ${colour}`}>
      <div className="flex items-center gap-2">
        <TrendingUp size={18} />
        <h2 className="text-sm font-semibold">Anonymous district price</h2>
      </div>
      <p className="text-sm leading-relaxed">{benchmark.message}</p>
      <p className="text-[11px] italic opacity-75">{benchmark.trustNote}</p>
    </section>
  );
}

function LogSaleCard({
  crop: defaultCrop,
  district: defaultDistrict,
  onSaved,
}: {
  crop: CropName;
  district: string;
  onSaved: () => void;
}) {
  const [open, setOpen] = useState(false);
  // Pre-fill from page-level filters but let the user override here so the
  // form is self-contained (you can log a sale for any crop/district without
  // changing the page filter at the top).
  const [crop, setCrop] = useState<CropName>(defaultCrop);
  const [district, setDistrict] = useState<string>(defaultDistrict);
  const [saleDate, setSaleDate] = useState<string>(
    () => new Date().toISOString().split("T")[0]
  );
  const [quantityKg, setQuantityKg] = useState("");
  const [pricePerKg, setPricePerKg] = useState("");
  const [buyerType, setBuyerType] = useState<string>("middleman");
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);

  // Re-sync defaults when the page-level filters change AND the form is closed.
  // Keeps the form intuitive when the user picks a different crop above and
  // then opens the form for the first time.
  useEffect(() => {
    if (!open) {
      setCrop(defaultCrop);
      setDistrict(defaultDistrict);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [defaultCrop, defaultDistrict]);

  async function save() {
    if (!quantityKg || !pricePerKg) {
      setErr("Quantity and price required");
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const res = await fetch("/api/farmer-sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          crop,
          district,
          saleDate,
          quantityKg: parseFloat(quantityKg),
          priceRmPerKg: parseFloat(pricePerKg),
          buyerType,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Save failed");
      setSavedAt(Date.now());
      setQuantityKg("");
      setPricePerKg("");
      onSaved();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Unknown");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="rounded-xl border border-stone-200 bg-white">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5 text-left"
      >
        <span className="text-sm font-medium">Log a sale</span>
        <span className="text-xs text-stone-500">
          {open ? "−" : "+ Add what you sold"}
        </span>
      </button>
      {open && (
        <div className="border-t border-stone-100 p-3 space-y-2">
          <p className="text-[11px] text-stone-500">
            Your number is anonymous — only the district median is shown to
            others. This is what lets the benchmark work.
          </p>

          {/* Crop + district inside the form so it's self-contained */}
          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="mb-1 block text-stone-500">Crop</span>
              <select
                value={crop}
                onChange={(e) => setCrop(e.target.value as CropName)}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                {CROPS.map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs">
              <span className="mb-1 block text-stone-500">District</span>
              <select
                value={district}
                onChange={(e) => setDistrict(e.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              >
                {DISTRICTS.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className="block text-xs">
            <span className="mb-1 block text-stone-500">Sale date</span>
            <input
              type="date"
              value={saleDate}
              onChange={(e) => setSaleDate(e.target.value)}
              max={new Date().toISOString().split("T")[0]}
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <label className="text-xs">
              <span className="block text-stone-500 mb-1">Quantity (kg)</span>
              <input
                type="number"
                value={quantityKg}
                onChange={(e) => setQuantityKg(e.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                placeholder="e.g. 12"
              />
            </label>
            <label className="text-xs">
              <span className="block text-stone-500 mb-1">RM per kg</span>
              <input
                type="number"
                step="0.01"
                value={pricePerKg}
                onChange={(e) => setPricePerKg(e.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
                placeholder="e.g. 3.80"
              />
            </label>
          </div>
          <label className="block text-xs">
            <span className="block text-stone-500 mb-1">Sold to</span>
            <select
              value={buyerType}
              onChange={(e) => setBuyerType(e.target.value)}
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            >
              <option value="middleman">Middleman / taukeh</option>
              <option value="market_stall">Pasar tani / market stall</option>
              <option value="restaurant">Restaurant / catering</option>
              <option value="direct_consumer">Direct to consumer</option>
              <option value="other">Other</option>
            </select>
          </label>
          {err && <p className="text-xs text-red-600">{err}</p>}
          <button
            onClick={save}
            disabled={saving}
            className="w-full rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save sale"}
          </button>
          {savedAt && (
            <p className="text-xs text-emerald-700 text-center">
              Saved. Benchmark will update next refresh.
            </p>
          )}
        </div>
      )}
    </section>
  );
}
