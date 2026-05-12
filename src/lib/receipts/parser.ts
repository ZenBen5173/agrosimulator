/**
 * Pure functions for normalising raw OCR-extracted receipt data.
 *
 * The Genkit flow returns rough data; this layer maps Malay/English
 * synonyms, normalises units, classifies categories, and computes
 * confidence tiers. All deterministic, all testable without an LLM.
 */

import type {
  ConfidenceTier,
  ItemCategory,
  ParsedReceipt,
  ReceiptLineItem,
} from "./types";

// ─── Vocabulary maps (BM ↔ EN) ──────────────────────────────────

/**
 * Common Malay agricultural terms found on receipts. Maps to the canonical
 * English category. Lower-case for matching.
 */
export const BM_AGRI_VOCAB: Record<string, ItemCategory> = {
  baja: "fertiliser",
  "racun kulat": "fungicide",
  "racun rumpai": "herbicide",
  "racun serangga": "insecticide",
  racun: "insecticide", // ambiguous default; LLM should disambiguate
  benih: "seed",
  biji: "seed",
  bahan: "other",
  alat: "tool_equipment",
  diesel: "fuel",
  petrol: "fuel",
};

/**
 * Common brand → category map for popular Malaysian agri products.
 * Use lowercased keys for matching.
 */
export const BRAND_CATEGORY_MAP: Record<string, ItemCategory> = {
  "dithane": "fungicide",
  "dithane m-45": "fungicide",
  mancozeb: "fungicide",
  daconil: "fungicide",
  chlorothalonil: "fungicide",
  antracol: "fungicide",
  beam: "fungicide",
  tricyclazole: "fungicide",
  tilt: "fungicide",
  propiconazole: "fungicide",
  apron: "fungicide",
  metalaxyl: "fungicide",
  mertect: "fungicide",
  thiabendazole: "fungicide",

  npk: "fertiliser",
  urea: "fertiliser",
  tsp: "fertiliser",
  "triple super phosphate": "fertiliser",
  sequestrene: "fertiliser",
  "iron chelate": "fertiliser",

  paraquat: "herbicide",
  glyphosate: "herbicide",
  roundup: "herbicide",

  chlorpyrifos: "insecticide",
};

// ─── Unit normalisation ─────────────────────────────────────────

/** Map raw unit strings to canonical unit. */
export function normaliseUnit(raw: string): string {
  const u = raw.toLowerCase().trim();
  if (["kg", "kilogram", "kilograms", "kilo", "kilos"].includes(u)) return "kg";
  if (["g", "gram", "grams", "gm"].includes(u)) return "g";
  if (["l", "litre", "litres", "liter", "liters"].includes(u)) return "litre";
  if (["ml", "millilitre", "millilitres"].includes(u)) return "ml";
  if (["sack", "sak", "karung", "bag", "bags"].includes(u)) return "sack";
  if (["packet", "paket", "pkt", "pack"].includes(u)) return "packet";
  if (["bottle", "botol", "btl"].includes(u)) return "bottle";
  if (["unit", "unt", "pcs", "pieces", "piece", "biji"].includes(u)) return "unit";
  return u;
}

// ─── Category classification ────────────────────────────────────

export function classifyCategory(text: string): ItemCategory {
  const lower = text.toLowerCase();

  // Brand check first (more specific)
  for (const brand in BRAND_CATEGORY_MAP) {
    if (lower.includes(brand)) return BRAND_CATEGORY_MAP[brand];
  }

  // BM term check
  for (const bm in BM_AGRI_VOCAB) {
    if (lower.includes(bm)) return BM_AGRI_VOCAB[bm];
  }

  // English fallback heuristics
  if (/fertili[sz]er|nitrogen|phosphor|potash/i.test(lower)) return "fertiliser";
  if (/fungicide|fungal|mildew|rust/i.test(lower)) return "fungicide";
  if (/herbicide|weed/i.test(lower)) return "herbicide";
  if (/insecticide|pesticide|insect|pest/i.test(lower)) return "insecticide";
  if (/seed/i.test(lower)) return "seed";

  return "other";
}

// ─── Confidence tiering ─────────────────────────────────────────

export function tierForScore(score: number): ConfidenceTier {
  if (score >= 0.85) return "auto";
  if (score >= 0.6) return "verify";
  return "confirm";
}

/**
 * Given a list of items and the supplier/date, produce an overall confidence
 * score: weighted average of per-item totals + presence of supplier/date
 * + line-total / receipt-total agreement (sanity check).
 */
export function computeOverallConfidence(receipt: {
  items: ReceiptLineItem[];
  totalAmountRm: number;
  supplierName?: string;
  receiptDate?: string;
}): number {
  if (receipt.items.length === 0) return 0;

  // Item-level confidence (use total field as the marker)
  const itemScores = receipt.items.map((it) => {
    if (it.confidence.totalRm === "auto") return 1;
    if (it.confidence.totalRm === "verify") return 0.7;
    return 0.4;
  });
  const itemAvg = itemScores.reduce((a, b) => a + b, 0) / itemScores.length;

  // Penalty if no supplier or no date
  const supplierBonus = receipt.supplierName ? 0 : -0.1;
  const dateBonus = receipt.receiptDate ? 0 : -0.05;

  // Sanity: do line totals add up to receipt total?
  const lineSum = receipt.items.reduce((acc, it) => acc + it.totalRm, 0);
  const ratio = lineSum > 0 ? Math.min(lineSum, receipt.totalAmountRm) / Math.max(lineSum, receipt.totalAmountRm) : 0;
  const sanityScore = ratio; // 1 if perfect agreement, 0 if completely off
  const sanityBonus = (sanityScore - 0.9) * 0.5; // small bump or hit around 0.9

  return Math.max(0, Math.min(1, itemAvg + supplierBonus + dateBonus + sanityBonus));
}

// ─── Receipt sanity check ───────────────────────────────────────

/**
 * Returns a list of warnings about a parsed receipt that the UI should show
 * to the farmer. Catches obvious OCR mishaps before writing to the books.
 */
export function receiptWarnings(receipt: ParsedReceipt): string[] {
  const warnings: string[] = [];

  if (receipt.items.length === 0) {
    warnings.push("No line items detected — please re-photograph more clearly.");
  }

  if (receipt.totalAmountRm <= 0) {
    warnings.push("Total amount is zero or missing.");
  }

  const lineSum = receipt.items.reduce((acc, it) => acc + it.totalRm, 0);
  if (
    receipt.totalAmountRm > 0 &&
    Math.abs(lineSum - receipt.totalAmountRm) > Math.max(1, receipt.totalAmountRm * 0.1)
  ) {
    warnings.push(
      `Line items sum to RM ${lineSum.toFixed(2)} but receipt total is RM ${receipt.totalAmountRm.toFixed(
        2
      )} — please verify.`
    );
  }

  if (!receipt.supplierName) {
    warnings.push("Supplier name not detected.");
  }
  if (!receipt.receiptDate) {
    warnings.push("Receipt date not detected.");
  }

  for (const item of receipt.items) {
    if (item.totalRm <= 0) {
      warnings.push(`Item "${item.itemName}" has zero or missing total.`);
    }
    if (item.quantity <= 0) {
      warnings.push(`Item "${item.itemName}" has zero or missing quantity.`);
    }
  }

  return warnings;
}

// ─── Fuzzy item dedup / merge ───────────────────────────────────

/**
 * Merge line items that look like the same product (same brand + same unit).
 * This handles OCR splitting one product across two lines or duplicate scans.
 */
export function mergeDuplicateItems(items: ReceiptLineItem[]): ReceiptLineItem[] {
  const merged: ReceiptLineItem[] = [];

  for (const item of items) {
    const existing = merged.find(
      (m) =>
        m.itemName.toLowerCase().trim() === item.itemName.toLowerCase().trim() &&
        m.unit === item.unit
    );
    if (existing) {
      existing.quantity += item.quantity;
      existing.totalRm += item.totalRm;
      // Keep the highest confidence for the merged row
      if (rank(item.confidence.totalRm) > rank(existing.confidence.totalRm)) {
        existing.confidence.totalRm = item.confidence.totalRm;
      }
    } else {
      merged.push({ ...item });
    }
  }

  return merged;
}

function rank(t: ConfidenceTier): number {
  return t === "auto" ? 2 : t === "verify" ? 1 : 0;
}
