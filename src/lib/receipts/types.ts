/**
 * Types for the AgroSim 2.0 receipt scanning pipeline.
 *
 * Receipts come in via the in-app camera or a gallery upload (a phone
 * screenshot of any chat-app receipt works). We always run the full
 * pipeline: photo → vision parse → normalisation → confidence-tiered
 * confirmation → inventory + accounting writes.
 */

/** What kind of agricultural product this line item represents */
export type ItemCategory =
  | "fertiliser"
  | "fungicide"
  | "insecticide"
  | "herbicide"
  | "seed"
  | "tool_equipment"
  | "fuel"
  | "service"
  | "other";

/** Confidence tier per field — drives the UI confirmation behaviour */
export type ConfidenceTier = "auto" | "verify" | "confirm";

export interface ReceiptLineItem {
  /** Raw text from receipt before any normalisation */
  rawText: string;

  /** Best guess of the product name (after normalisation) */
  itemName: string;

  /** Optional brand if recognisable (e.g. "Dithane M-45") */
  brand?: string;

  category: ItemCategory;

  quantity: number;
  unit: string; // e.g. "kg", "litre", "sack", "packet"

  unitPriceRm?: number;
  totalRm: number;

  /** Per-field confidence so the UI can highlight things to verify */
  confidence: {
    itemName: ConfidenceTier;
    quantity: ConfidenceTier;
    totalRm: ConfidenceTier;
  };
}

export interface ParsedReceipt {
  supplierName?: string;
  receiptDate?: string; // ISO date
  totalAmountRm: number;
  currency: string; // "RM"
  items: ReceiptLineItem[];

  /** Overall confidence — drives the UI defaults */
  overallConfidence: ConfidenceTier;
  overallConfidenceScore: number; // 0–1

  /** What the model literally observed about the receipt */
  observations: string[];

  /** Quality flag */
  imageQuality: "good" | "acceptable" | "poor" | "unusable";
}

/** What the orchestrator returns after merging into inventory */
export interface ReceiptApplyResult {
  receipt: ParsedReceipt;
  inventoryUpdates: {
    itemName: string;
    quantityAdded: number;
    unit: string;
    newBalance?: number;
  }[];
  expenseLogged: {
    totalRm: number;
    supplierName?: string;
    date?: string;
  };
}
