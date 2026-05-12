"use client";

/**
 * AgroSim 2.0 — Pact: Start a new group buy.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ArrowLeft, Loader2, ClipboardCopy, Check, Info } from "lucide-react";
import { savingsPercent, savingsPerUnit } from "@/lib/pact/groupBuy";

const DEFAULT_DAYS_OPEN = 7;

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

export default function NewGroupBuyPage() {
  const router = useRouter();
  const [farmId, setFarmId] = useState<string | null>(null);

  const [district, setDistrict] = useState<string>("Cameron Highlands");
  const [itemName, setItemName] = useState("");
  const [unit, setUnit] = useState("sack");
  const [individualPrice, setIndividualPrice] = useState("");
  const [bulkPrice, setBulkPrice] = useState("");
  const [minParticipants, setMinParticipants] = useState("3");
  const [daysOpen, setDaysOpen] = useState(String(DEFAULT_DAYS_OPEN));
  const [supplierName, setSupplierName] = useState("");

  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) {
        router.replace("/auth/login");
        return;
      }
      const { data: farm } = await supabase
        .from("farms")
        .select("id, district")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (farm) {
        setFarmId(farm.id);
        if (farm.district && DISTRICTS.includes(farm.district)) {
          setDistrict(farm.district);
        }
      }
    });
  }, [router]);

  const indPriceN = parseFloat(individualPrice);
  const bulkPriceN = parseFloat(bulkPrice);
  const savings =
    Number.isFinite(indPriceN) && Number.isFinite(bulkPriceN)
      ? savingsPercent(indPriceN, bulkPriceN)
      : 0;

  async function submit() {
    if (!farmId) {
      setErrorMsg("No farm — set up in Onboarding first");
      return;
    }
    setSubmitting(true);
    setErrorMsg(null);
    try {
      const closesAt = new Date();
      closesAt.setDate(closesAt.getDate() + (parseInt(daysOpen, 10) || DEFAULT_DAYS_OPEN));

      const res = await fetch("/api/pact/group-buy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          initiatorFarmId: farmId,
          district,
          itemName,
          unit,
          individualPriceRm: indPriceN,
          bulkPriceRm: bulkPriceN,
          minParticipants: parseInt(minParticipants, 10),
          closesAt: closesAt.toISOString(),
          supplierName: supplierName || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.errors && Array.isArray(data.errors)) {
          throw new Error(data.errors.map((e: { message: string }) => e.message).join("; "));
        }
        throw new Error(data.error || "Create failed");
      }
      router.push(`/pact/group-buys/${data.id}`);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Unknown");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 pb-24">
      <header className="border-b bg-white px-4 py-3 flex items-center gap-2">
        <button onClick={() => router.back()} aria-label="Back">
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 className="text-lg font-semibold">Start a group buy</h1>
          <p className="text-[11px] text-stone-500">
            Other farmers in your district will see this and can tap to join.
          </p>
        </div>
      </header>

      <main className="mx-auto max-w-xl space-y-4 p-4">
        <section className="rounded-xl border border-stone-200 bg-white p-3 space-y-3">
          <Field label="District">
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
          </Field>

          <Field label="Item name">
            <input
              value={itemName}
              onChange={(e) => setItemName(e.target.value)}
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              placeholder="e.g. NPK 15-15-15"
            />
          </Field>

          <Field label="Unit">
            <select
              value={unit}
              onChange={(e) => setUnit(e.target.value)}
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            >
              <option value="sack">Sack / karung</option>
              <option value="kg">Kilogram</option>
              <option value="litre">Litre</option>
              <option value="packet">Packet</option>
              <option value="bottle">Bottle</option>
              <option value="unit">Unit</option>
            </select>
          </Field>

          {/* ── Price ladder: helps the farmer DISCOVER the bulk price ── */}
          <PriceLadder
            itemName={itemName}
            unit={unit}
            district={district}
            minParticipants={parseInt(minParticipants, 10) || 3}
            individualPrice={individualPrice}
            bulkPrice={bulkPrice}
            onIndividualChange={setIndividualPrice}
            onBulkChange={setBulkPrice}
            savings={savings}
          />

          <div className="grid grid-cols-2 gap-2">
            <Field label="Min participants">
              <input
                type="number"
                min={2}
                value={minParticipants}
                onChange={(e) => setMinParticipants(e.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </Field>
            <Field label="Open for (days)">
              <input
                type="number"
                min={1}
                value={daysOpen}
                onChange={(e) => setDaysOpen(e.target.value)}
                className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              />
            </Field>
          </div>

          <Field label="Supplier (optional)">
            <input
              value={supplierName}
              onChange={(e) => setSupplierName(e.target.value)}
              className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
              placeholder="e.g. Kedai Ah Kow"
            />
          </Field>
        </section>

        {errorMsg && (
          <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-800">
            {errorMsg}
          </div>
        )}

        <button
          onClick={submit}
          disabled={submitting || !farmId}
          className="w-full rounded-lg bg-emerald-600 px-4 py-3 text-sm font-medium text-white disabled:opacity-50 flex items-center justify-center gap-2"
        >
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null}
          {submitting ? "Creating…" : "Open the group buy"}
        </button>
      </main>
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block text-xs">
      <span className="block text-stone-500 mb-1">{label}</span>
      {children}
    </label>
  );
}

// ─── Price ladder ──────────────────────────────────────────────

/**
 * Typical Malaysian agri-input bulk discount ranges by item category.
 * These are reference numbers from kedai pertanian + DOA price guides — used
 * only as a hint, not a hard rule. Most fertilizer / pesticide kedai give
 * progressively bigger discounts as you order more sacks.
 *
 * Format: percent off the single-unit price at the typical bulk threshold
 * (3-5+ sacks for fertilizer, 1+ carton for pesticide, etc.).
 */
const BULK_DISCOUNT_HINTS: { match: RegExp; tier: string; pct: string }[] = [
  { match: /npk|baja|fertili[sz]er|urea|ammonium/i, tier: "5+ sacks", pct: "12-22%" },
  { match: /seed|benih/i, tier: "10+ packets", pct: "15-25%" },
  { match: /fungicide|pesticide|herbicide|racun/i, tier: "1 carton", pct: "10-18%" },
  { match: /mulch|plastic|net/i, tier: "1 roll", pct: "8-15%" },
];

function PriceLadder({
  itemName,
  unit,
  district,
  minParticipants,
  individualPrice,
  bulkPrice,
  onIndividualChange,
  onBulkChange,
  savings,
}: {
  itemName: string;
  unit: string;
  district: string;
  minParticipants: number;
  individualPrice: string;
  bulkPrice: string;
  onIndividualChange: (v: string) => void;
  onBulkChange: (v: string) => void;
  savings: number;
}) {
  const indN = parseFloat(individualPrice);
  const bulkN = parseFloat(bulkPrice);
  const hasBoth = Number.isFinite(indN) && Number.isFinite(bulkN) && indN > 0;
  const perUnitSaving = hasBoth ? savingsPerUnit(indN, bulkN) : 0;

  // Visual bar widths — bulk relative to individual
  const bulkRatio = hasBoth && indN > 0 ? Math.max(0.05, bulkN / indN) : 0;

  // Reference hint for this item
  const hint = BULK_DISCOUNT_HINTS.find((h) => h.match.test(itemName));

  // Copy a ready-to-send quote-request to the clipboard. Channel-agnostic on
  // purpose — the farmer pastes into whichever messaging app they actually
  // use with their kedai (SMS, Telegram, in-app chat, even email). We don't
  // assume WhatsApp.
  const [copied, setCopied] = useState(false);
  function copyQuoteRequest() {
    const item = itemName.trim() || "(item)";
    const u = unit.trim() || "unit";
    const message = [
      `Salam tuan,`,
      ``,
      `Saya petani dari kawasan ${district}. Boleh tanya harga untuk:`,
      ``,
      `• 1 ${u} ${item}`,
      `• 5 ${u} ${item}`,
      `• 10 ${u} ${item}`,
      ``,
      `Saya tengah cuba kumpul ${minParticipants} orang petani lain untuk order sama-sama. Kalau boleh dapat bulk price, kami order serentak.`,
      ``,
      `Terima kasih.`,
    ].join("\n");
    navigator.clipboard
      .writeText(message)
      .then(() => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 2500);
      })
      .catch(() => {
        // Clipboard API can fail in some embedded contexts; fall back to a
        // prompt so the farmer can manually copy.
        window.prompt("Copy this message and send to your kedai:", message);
      });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-stone-700">Price ladder</span>
        <button
          type="button"
          onClick={copyQuoteRequest}
          aria-live="polite"
          className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[11px] font-medium transition-colors ${
            copied
              ? "bg-emerald-600 text-white"
              : "bg-stone-100 text-stone-700 hover:bg-stone-200"
          }`}
        >
          {copied ? <Check size={12} /> : <ClipboardCopy size={12} />}
          {copied ? "Copied — paste to your kedai" : "Copy quote request"}
        </button>
      </div>

      {/* Inline reference hint — only when we recognise the item type */}
      {hint && (
        <div className="flex items-start gap-2 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-[11px] text-stone-600">
          <Info size={13} className="mt-[1px] flex-shrink-0 text-stone-400" />
          <span>
            Typical Malaysian kedai discount for this kind of item:{" "}
            <strong className="text-stone-700">{hint.pct}</strong> off at{" "}
            {hint.tier}. Use as a rough guide only — get the real quote.
          </span>
        </div>
      )}

      {/* Two price inputs with concrete labels referencing quantity */}
      <div className="grid grid-cols-2 gap-2">
        <Field label={`If you buy 1 ${unit} alone (RM)`}>
          <input
            type="number"
            step="0.01"
            value={individualPrice}
            onChange={(e) => onIndividualChange(e.target.value)}
            className="w-full rounded border border-stone-300 px-2 py-1.5 text-sm"
            placeholder="95.00"
            inputMode="decimal"
          />
        </Field>
        <Field
          label={`If ${minParticipants}+ farmers order together — per ${unit} (RM)`}
        >
          <input
            type="number"
            step="0.01"
            value={bulkPrice}
            onChange={(e) => onBulkChange(e.target.value)}
            className="w-full rounded border border-emerald-300 px-2 py-1.5 text-sm"
            placeholder="78.00"
            inputMode="decimal"
          />
        </Field>
      </div>

      {/* Visual comparison + savings — only when both prices entered */}
      {hasBoth && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 space-y-2.5">
          <div className="space-y-1.5">
            <PriceBar
              label={`Alone — 1 ${unit}`}
              valueLabel={`RM ${indN.toFixed(2)}`}
              ratio={1}
              colour="bg-stone-400"
            />
            <PriceBar
              label={`Group — ${minParticipants}+ ${unit}${minParticipants > 1 ? "s" : ""} together`}
              valueLabel={`RM ${bulkN.toFixed(2)}`}
              ratio={bulkRatio}
              colour="bg-emerald-500"
            />
          </div>
          <div className="border-t border-emerald-200 pt-2 text-xs text-emerald-900">
            You save <strong>RM {perUnitSaving.toFixed(2)}</strong> per {unit} —
            that&apos;s <strong>{savings}% off</strong>. With{" "}
            {minParticipants} farmers each taking 1 {unit}, the group saves{" "}
            <strong>RM {(perUnitSaving * minParticipants).toFixed(2)}</strong>{" "}
            in total.
          </div>
        </div>
      )}
    </div>
  );
}

function PriceBar({
  label,
  valueLabel,
  ratio,
  colour,
}: {
  label: string;
  valueLabel: string;
  ratio: number;
  colour: string;
}) {
  const pct = Math.max(4, Math.min(100, Math.round(ratio * 100)));
  return (
    <div>
      <div className="mb-0.5 flex items-baseline justify-between text-[11px]">
        <span className="text-stone-700">{label}</span>
        <span className="font-mono font-medium text-stone-900">{valueLabel}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-white">
        <div
          className={`h-full rounded-full ${colour} transition-[width] duration-200`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
