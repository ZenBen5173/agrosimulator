/**
 * Tests for the receipt parser pure functions and the orchestrator's
 * normalisation step.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@/flows/receiptScanning", () => ({
  scanReceiptFlow: vi.fn(),
}));

import {
  classifyCategory,
  normaliseUnit,
  tierForScore,
  computeOverallConfidence,
  receiptWarnings,
  mergeDuplicateItems,
} from "@/lib/receipts/parser";
import {
  parseRawReceipt,
  scanAndParseReceipt,
} from "@/services/receipts/orchestrator";
import { scanReceiptFlow } from "@/flows/receiptScanning";
import type { ReceiptLineItem } from "@/lib/receipts/types";

// ─── Unit normalisation ─────────────────────────────────────────

describe("normaliseUnit", () => {
  it("normalises kg variants", () => {
    expect(normaliseUnit("KG")).toBe("kg");
    expect(normaliseUnit("kilogram")).toBe("kg");
    expect(normaliseUnit("Kilos")).toBe("kg");
  });
  it("normalises BM and EN sack/karung", () => {
    expect(normaliseUnit("karung")).toBe("sack");
    expect(normaliseUnit("Sak")).toBe("sack");
    expect(normaliseUnit("bag")).toBe("sack");
  });
  it("normalises packet variants", () => {
    expect(normaliseUnit("paket")).toBe("packet");
    expect(normaliseUnit("PKT")).toBe("packet");
  });
  it("passes unknown units through lowercased", () => {
    expect(normaliseUnit("Roll")).toBe("roll");
  });
});

// ─── Category classification ────────────────────────────────────

describe("classifyCategory", () => {
  it("classifies BM term 'baja' as fertiliser", () => {
    expect(classifyCategory("Baja NPK 15-15-15")).toBe("fertiliser");
  });
  it("classifies 'racun kulat' as fungicide", () => {
    expect(classifyCategory("Racun kulat Dithane")).toBe("fungicide");
  });
  it("classifies 'racun rumpai' as herbicide", () => {
    expect(classifyCategory("Racun rumpai Roundup 1L")).toBe("herbicide");
  });
  it("classifies brand-only entries by brand map", () => {
    expect(classifyCategory("Mancozeb 80% WP 1kg")).toBe("fungicide");
    expect(classifyCategory("Antracol 250g")).toBe("fungicide");
    expect(classifyCategory("NPK 15-15-15")).toBe("fertiliser");
  });
  it("falls back to other for unknown items", () => {
    expect(classifyCategory("Mystery liquid")).toBe("other");
  });
});

// ─── Confidence tiering ─────────────────────────────────────────

describe("tierForScore", () => {
  it("assigns auto for 0.85+", () => {
    expect(tierForScore(0.85)).toBe("auto");
    expect(tierForScore(1)).toBe("auto");
  });
  it("assigns verify for 0.6-0.84", () => {
    expect(tierForScore(0.6)).toBe("verify");
    expect(tierForScore(0.84)).toBe("verify");
  });
  it("assigns confirm below 0.6", () => {
    expect(tierForScore(0.59)).toBe("confirm");
    expect(tierForScore(0)).toBe("confirm");
  });
});

// ─── Overall confidence ─────────────────────────────────────────

describe("computeOverallConfidence", () => {
  function mkItem(overrides: Partial<ReceiptLineItem> = {}): ReceiptLineItem {
    return {
      rawText: "x",
      itemName: "x",
      category: "other",
      quantity: 1,
      unit: "unit",
      totalRm: 10,
      confidence: { itemName: "auto", quantity: "auto", totalRm: "auto" },
      ...overrides,
    };
  }

  it("returns 0 for empty items", () => {
    expect(
      computeOverallConfidence({ items: [], totalAmountRm: 0 })
    ).toBe(0);
  });

  it("rewards perfect line-total agreement", () => {
    const score = computeOverallConfidence({
      items: [mkItem({ totalRm: 10 }), mkItem({ totalRm: 10 })],
      totalAmountRm: 20,
      supplierName: "Kedai Ah Kow",
      receiptDate: "2026-05-01",
    });
    expect(score).toBeGreaterThan(0.9);
  });

  it("penalises missing supplier and date", () => {
    const withMeta = computeOverallConfidence({
      items: [mkItem({ totalRm: 10 })],
      totalAmountRm: 10,
      supplierName: "Kedai",
      receiptDate: "2026-05-01",
    });
    const withoutMeta = computeOverallConfidence({
      items: [mkItem({ totalRm: 10 })],
      totalAmountRm: 10,
    });
    expect(withMeta).toBeGreaterThan(withoutMeta);
  });

  it("penalises confirm-tier items", () => {
    const high = computeOverallConfidence({
      items: [mkItem()],
      totalAmountRm: 10,
      supplierName: "K",
      receiptDate: "2026-05-01",
    });
    const low = computeOverallConfidence({
      items: [
        mkItem({
          confidence: { itemName: "confirm", quantity: "confirm", totalRm: "confirm" },
        }),
      ],
      totalAmountRm: 10,
      supplierName: "K",
      receiptDate: "2026-05-01",
    });
    expect(high).toBeGreaterThan(low);
  });
});

// ─── Item merging ───────────────────────────────────────────────

describe("mergeDuplicateItems", () => {
  it("merges items with the same name and unit", () => {
    const items: ReceiptLineItem[] = [
      {
        rawText: "Mancozeb 1kg",
        itemName: "Mancozeb 80% WP",
        category: "fungicide",
        quantity: 1,
        unit: "kg",
        totalRm: 12,
        confidence: { itemName: "auto", quantity: "auto", totalRm: "auto" },
      },
      {
        rawText: "Mancozeb 2kg",
        itemName: "Mancozeb 80% WP",
        category: "fungicide",
        quantity: 2,
        unit: "kg",
        totalRm: 24,
        confidence: { itemName: "auto", quantity: "auto", totalRm: "verify" },
      },
    ];
    const merged = mergeDuplicateItems(items);
    expect(merged).toHaveLength(1);
    expect(merged[0].quantity).toBe(3);
    expect(merged[0].totalRm).toBe(36);
    // Merged keeps the highest tier (auto > verify)
    expect(merged[0].confidence.totalRm).toBe("auto");
  });

  it("keeps items with different units separate", () => {
    const items: ReceiptLineItem[] = [
      {
        rawText: "x",
        itemName: "Urea",
        category: "fertiliser",
        quantity: 1,
        unit: "kg",
        totalRm: 8,
        confidence: { itemName: "auto", quantity: "auto", totalRm: "auto" },
      },
      {
        rawText: "x",
        itemName: "Urea",
        category: "fertiliser",
        quantity: 1,
        unit: "sack",
        totalRm: 60,
        confidence: { itemName: "auto", quantity: "auto", totalRm: "auto" },
      },
    ];
    const merged = mergeDuplicateItems(items);
    expect(merged).toHaveLength(2);
  });
});

// ─── Warnings ───────────────────────────────────────────────────

describe("receiptWarnings", () => {
  it("warns about empty items", () => {
    const warnings = receiptWarnings({
      supplierName: "K",
      receiptDate: "2026-05-01",
      totalAmountRm: 10,
      currency: "RM",
      items: [],
      overallConfidence: "verify",
      overallConfidenceScore: 0.5,
      observations: [],
      imageQuality: "good",
    });
    expect(warnings.some((w) => /no line items/i.test(w))).toBe(true);
  });

  it("warns when line totals don't match receipt total", () => {
    const warnings = receiptWarnings({
      supplierName: "K",
      receiptDate: "2026-05-01",
      totalAmountRm: 50,
      currency: "RM",
      items: [
        {
          rawText: "x",
          itemName: "Item",
          category: "other",
          quantity: 1,
          unit: "kg",
          totalRm: 10,
          confidence: { itemName: "auto", quantity: "auto", totalRm: "auto" },
        },
      ],
      overallConfidence: "verify",
      overallConfidenceScore: 0.5,
      observations: [],
      imageQuality: "good",
    });
    expect(warnings.some((w) => /sum to RM/i.test(w))).toBe(true);
  });
});

// ─── parseRawReceipt orchestration ──────────────────────────────

describe("parseRawReceipt", () => {
  it("normalises units and classifies categories", () => {
    const result = parseRawReceipt({
      supplierName: "Kedai Ah Kow",
      receiptDate: "2026-05-01",
      totalAmountRm: 40,
      currency: "RM",
      items: [
        {
          rawText: "Baja NPK 15-15-15 - 1 karung",
          itemName: "NPK 15-15-15",
          brand: null,
          quantity: 1,
          unit: "karung",
          unitPriceRm: 40,
          totalRm: 40,
          confidenceItemName: 0.9,
          confidenceQuantity: 0.95,
          confidenceTotal: 0.95,
        },
      ],
      imageQuality: "good",
      observations: ["thermal printed receipt"],
    });

    expect(result.items[0].unit).toBe("sack");
    expect(result.items[0].category).toBe("fertiliser");
    expect(result.items[0].confidence.totalRm).toBe("auto");
    expect(result.overallConfidence).toBe("auto");
  });

  it("merges duplicates when same name + unit appear twice", () => {
    const result = parseRawReceipt({
      supplierName: "Kedai",
      receiptDate: "2026-05-01",
      totalAmountRm: 24,
      currency: "RM",
      items: [
        {
          rawText: "Mancozeb 1kg",
          itemName: "Mancozeb 80% WP",
          brand: "Dithane",
          quantity: 1,
          unit: "kg",
          unitPriceRm: 12,
          totalRm: 12,
          confidenceItemName: 0.9,
          confidenceQuantity: 0.9,
          confidenceTotal: 0.9,
        },
        {
          rawText: "Mancozeb 1kg",
          itemName: "Mancozeb 80% WP",
          brand: "Dithane",
          quantity: 1,
          unit: "kg",
          unitPriceRm: 12,
          totalRm: 12,
          confidenceItemName: 0.9,
          confidenceQuantity: 0.9,
          confidenceTotal: 0.9,
        },
      ],
      imageQuality: "good",
      observations: [],
    });

    expect(result.items).toHaveLength(1);
    expect(result.items[0].quantity).toBe(2);
    expect(result.items[0].totalRm).toBe(24);
  });
});

// ─── scanAndParseReceipt with mocked Gemini ─────────────────────

describe("scanAndParseReceipt (mocked)", () => {
  beforeEach(() => {
    vi.mocked(scanReceiptFlow).mockReset();
  });

  it("calls scanReceiptFlow once with the photo args", async () => {
    vi.mocked(scanReceiptFlow).mockResolvedValue({
      supplierName: "Kedai Ah Kow",
      receiptDate: "2026-05-01",
      totalAmountRm: 24,
      currency: "RM",
      items: [
        {
          rawText: "Mancozeb 2kg",
          itemName: "Mancozeb 80% WP",
          brand: "Dithane M-45",
          quantity: 2,
          unit: "kg",
          unitPriceRm: 12,
          totalRm: 24,
          confidenceItemName: 0.95,
          confidenceQuantity: 0.95,
          confidenceTotal: 0.95,
        },
      ],
      imageQuality: "good",
      observations: ["Thermal receipt, clear"],
    });

    const result = await scanAndParseReceipt({
      photoBase64: "fake",
      photoMimeType: "image/jpeg",
    });

    expect(scanReceiptFlow).toHaveBeenCalledOnce();
    expect(result.receipt.items).toHaveLength(1);
    expect(result.receipt.items[0].category).toBe("fungicide");
    expect(result.receipt.items[0].confidence.totalRm).toBe("auto");
    expect(result.warnings).toEqual([]);
  });

  it("surfaces warnings when the receipt is incomplete", async () => {
    vi.mocked(scanReceiptFlow).mockResolvedValue({
      supplierName: null,
      receiptDate: null,
      totalAmountRm: 0,
      currency: "RM",
      items: [],
      imageQuality: "poor",
      observations: ["blurry"],
    });

    const result = await scanAndParseReceipt({
      photoBase64: "fake",
      photoMimeType: "image/jpeg",
    });

    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.receipt.overallConfidence).toBe("confirm");
  });
});
