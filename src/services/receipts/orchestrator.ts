/**
 * Receipt scanning orchestrator.
 *
 * Wraps the Gemini scanReceiptFlow with the deterministic parser. Returns
 * a normalised, confidence-tiered ParsedReceipt that the UI can render.
 *
 * Inventory and accounting writes are NOT done here — that's the API
 * route's job, after farmer confirmation.
 */

import { scanReceiptFlow, type RawReceipt } from "@/flows/receiptScanning";
import {
  classifyCategory,
  computeOverallConfidence,
  mergeDuplicateItems,
  normaliseUnit,
  receiptWarnings,
  tierForScore,
} from "@/lib/receipts/parser";
import type { ParsedReceipt, ReceiptLineItem } from "@/lib/receipts/types";

export async function scanAndParseReceipt(input: {
  photoBase64: string;
  photoMimeType: string;
}): Promise<{ receipt: ParsedReceipt; warnings: string[] }> {
  const raw = await scanReceiptFlow(input);
  const receipt = parseRawReceipt(raw);
  return {
    receipt,
    warnings: receiptWarnings(receipt),
  };
}

/**
 * Pure normalisation step — extracted so it can be unit-tested without
 * touching Gemini.
 */
export function parseRawReceipt(raw: RawReceipt): ParsedReceipt {
  const items: ReceiptLineItem[] = raw.items.map((it) => ({
    rawText: it.rawText,
    itemName: it.itemName.trim(),
    brand: it.brand?.trim() || undefined,
    category: classifyCategory(`${it.itemName} ${it.brand ?? ""}`),
    quantity: it.quantity,
    unit: normaliseUnit(it.unit),
    unitPriceRm: it.unitPriceRm ?? undefined,
    totalRm: it.totalRm,
    confidence: {
      itemName: tierForScore(it.confidenceItemName),
      quantity: tierForScore(it.confidenceQuantity),
      totalRm: tierForScore(it.confidenceTotal),
    },
  }));

  const merged = mergeDuplicateItems(items);

  const overall: ParsedReceipt = {
    supplierName: raw.supplierName ?? undefined,
    receiptDate: raw.receiptDate ?? undefined,
    totalAmountRm: raw.totalAmountRm,
    currency: raw.currency || "RM",
    items: merged,
    overallConfidence: "verify",
    overallConfidenceScore: 0,
    observations: raw.observations,
    imageQuality: raw.imageQuality,
  };

  const score = computeOverallConfidence(overall);
  overall.overallConfidenceScore = score;
  overall.overallConfidence = tierForScore(score);

  return overall;
}
