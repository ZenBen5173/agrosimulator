"use client";

/**
 * AgroSim 2.0 — Pact layer surface.
 *
 * Three sections:
 *   1. Anonymous district price benchmark — the killer line
 *   2. Open group buys in your district + "Start one" button
 *   3. Log a sale (feeds the benchmark for everyone)
 *
 * Replaces the 1.0 market page (stock-market-style charts) which was
 * cut from the 2.0 spec.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  TrendingUp,
  Users,
  ChevronRight,
  Loader2,
  Check,
} from "lucide-react";
import type { CropName } from "@/lib/diagnosis/types";
import type {
  GroupBuyStatus,
  PriceBenchmarkResponse,
} from "@/lib/pact/types";
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
  const [groupBuys, setGroupBuys] = useState<GroupBuyStatus[]>([]);
  const [loadingGroupBuys, setLoadingGroupBuys] = useState(false);

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

  useEffect(() => {
    let cancelled = false;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoadingGroupBuys(true);
    fetch(`/api/pact/group-buy?district=${encodeURIComponent(district)}`)
      .then((r) => r.json())
      .then((d) => { if (!cancelled) setGroupBuys(d.groupBuys ?? []); })
      .catch(() => { if (!cancelled) setGroupBuys([]); })
      .finally(() => { if (!cancelled) setLoadingGroupBuys(false); });
    return () => { cancelled = true; };
  }, [district]);

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b border-stone-200 bg-white px-4 py-3">
        <div className="mx-auto flex max-w-xl items-center gap-2">
          <button onClick={() => router.back()} aria-label="Back">
            <ArrowLeft size={18} className="text-stone-500" />
          </button>
          <div>
            <h1 className="text-lg font-semibold text-stone-900">Pact</h1>
            <p className="text-[11px] leading-none text-stone-500">
              Real prices, group buys, share what you sold.
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

        {/* ── Group buys (split: joined first, then joinable) ── */}
        <GroupBuysSection
          loading={loadingGroupBuys}
          groupBuys={groupBuys}
          district={district}
          onStartNew={() => router.push("/pact/group-buys/new")}
        />
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

function GroupBuysSection({
  loading,
  groupBuys,
  district,
  onStartNew,
}: {
  loading: boolean;
  groupBuys: GroupBuyStatus[];
  district: string;
  onStartNew: () => void;
}) {
  const joined = groupBuys.filter((g) => g.farmerCommitted);
  const joinable = groupBuys.filter((g) => !g.farmerCommitted);

  return (
    <div className="space-y-8">
      {loading && (
        <div className="rounded-xl border border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
          <Loader2 size={18} className="mr-2 inline-block animate-spin" />
          Loading…
        </div>
      )}

      {!loading && joined.length > 0 && (
        <section>
          <SectionLabel>You&apos;ve joined</SectionLabel>
          <div className="space-y-2">
            {joined.map((g) => (
              <GroupBuyRow key={g.groupBuyId} g={g} variant="joined" />
            ))}
          </div>
        </section>
      )}

      {!loading && (
        <section>
          <div className="mb-2 flex items-center justify-between px-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-stone-400">
              Open in {district}
            </p>
            <button
              onClick={onStartNew}
              className="text-xs font-medium text-emerald-700 hover:underline"
            >
              + Start one
            </button>
          </div>
          {joinable.length === 0 ? (
            <div className="rounded-xl border border-dashed border-stone-300 bg-white p-6 text-center text-xs text-stone-500">
              {joined.length > 0
                ? "Nothing else open right now — start one and see who joins."
                : "No open group buys in your district yet. Start one and see who joins."}
            </div>
          ) : (
            <div className="space-y-2">
              {joinable.map((g) => (
                <GroupBuyRow key={g.groupBuyId} g={g} variant="open" />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
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

function GroupBuyRow({
  g,
  variant = "open",
}: {
  g: GroupBuyStatus;
  variant?: "joined" | "open";
}) {
  const ratio = Math.min(1, g.participantsJoined / g.participantsTarget);
  const isJoined = variant === "joined";

  // Joined buys get an emerald-tinted card so they visually separate from
  // joinable ones at a glance — matching the "you're in this" trust posture.
  const cardClass = isJoined
    ? "block rounded-xl border-2 border-emerald-300 bg-emerald-50/40 p-3 hover:border-emerald-500"
    : "block rounded-xl border border-stone-200 bg-white p-3 hover:border-emerald-400";

  return (
    <Link href={`/pact/group-buys/${g.groupBuyId}`} className={cardClass}>
      <div className="flex items-start justify-between">
        <div className="min-w-0">
          <p className="text-sm font-medium text-stone-900">{g.itemName}</p>
          <p className="mt-0.5 text-xs text-stone-500">
            Bulk RM {g.bulkPriceRm.toFixed(2)}/{g.unit}
            <span className="text-stone-400">
              {" "}
              · alone RM {g.individualPriceRm.toFixed(2)}
            </span>
          </p>
          <p className="mt-1 text-xs font-medium text-emerald-700">
            Save RM {g.savingsRm.toFixed(2)}/{g.unit}
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-1 text-xs text-stone-700">
            <Users size={12} />
            <span>
              {g.participantsJoined}/{g.participantsTarget}
            </span>
          </div>
          {isJoined && (
            <span className="inline-flex items-center gap-1 rounded bg-emerald-600 px-1.5 py-0.5 text-[10px] font-medium text-white">
              <Check size={10} /> Joined
            </span>
          )}
          <ChevronRight size={14} className="text-stone-300" />
        </div>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
        <div
          className={`h-full ${isJoined ? "bg-emerald-600" : "bg-emerald-400"}`}
          style={{ width: `${Math.round(ratio * 100)}%` }}
        />
      </div>
    </Link>
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
