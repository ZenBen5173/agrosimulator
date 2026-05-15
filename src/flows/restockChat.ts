/**
 * AgroSim 2.1 — Restock chat Genkit flows.
 *
 * Three named flows that power the Chat-to-Action restock workflow:
 *
 *  1. draftRfqFlow            — given an inventory item context, AI
 *                                drafts the RFQ details + a copy-to-
 *                                clipboard message for the supplier.
 *  2. parseSupplierQuoteFlow  — multi-format ingest (PDF / image / text)
 *                                of the supplier's reply; returns the
 *                                tier pricing + bulk-discount judgement.
 *  3. draftConsolidatedPoFlow — when a group buy ends, AI drafts the
 *                                consolidated PO message + delivery
 *                                instructions. Code does the PDF.
 *
 * Architectural rule (the v2.1 promise): AI handles language + decisions
 * + extraction. Code handles PDFs, ledger writes, group-buy creation.
 * The farmer just taps to approve.
 *
 * Each flow returns a strictly-typed Zod payload so the UI / orchestrator
 * can render rich actions ("Generate RFQ", "Yes, start group buy") with
 * full confidence in the field shapes.
 */

import { z } from "genkit";
import { ai, DEFAULT_MODEL, DISEASE_MODEL } from "@/lib/genkit";

// ─── 1. RFQ draft flow ──────────────────────────────────────────

const RfqDetailsSchema = z.object({
  /** Recommended quantity in the item's native unit (driven by current stock + reorder qty) */
  recommendedQuantity: z.number(),
  unit: z.string(),
  /**
   * Multi-tier ladder for the supplier to quote against. Always includes
   * the recommended quantity plus 2-3 bulk options so we can detect a
   * meaningful discount and propose a group buy.
   */
  quantityTiers: z.array(
    z.object({
      qty: z.number(),
      label: z.string(), // human-readable: "Just for me", "Group of 5", etc.
    })
  ),
  /** AI-drafted message body the farmer can copy-paste to their supplier (BM-leaning, polite) */
  copyToClipboardMessage: z.string(),
  /** One-sentence summary line for the chat thread ("Drafted RFQ for 12 kg NPK 15-15-15") */
  summary: z.string(),
});

export type RfqDetails = z.infer<typeof RfqDetailsSchema>;

const RFQ_SYSTEM = `You are an assistant helping Malaysian smallholder farmers draft a Request for Quotation (RFQ) message to their kedai pertanian (agricultural shop).

ABSOLUTE RULES:
1. The message you draft is what the farmer will copy-paste to send to the supplier (via WhatsApp / Telegram / SMS / in-person). It must be SHORT, POLITE, and BILINGUAL (BM primary, English fallback for product names).
2. Always include 3 quantity tiers: (a) what one farmer needs alone, (b) a group of ~5, (c) a larger group of ~10. This lets the supplier offer a bulk discount and us decide whether a group buy is worth it.
3. Never invent prices. The farmer wants the supplier to QUOTE — don't put numbers in the message.
4. Output JSON matching the schema. No prose, no markdown.

Tone reference: short, respectful, written in the way a real Malaysian smallholder would WhatsApp a kedai owner. Use "Salam tuan," opening when the supplier is unfamiliar.`;

export const draftRfqFlow = ai.defineFlow(
  {
    name: "draftRfq",
    inputSchema: z.object({
      itemName: z.string(),
      itemType: z.string().optional(),
      currentQuantity: z.number(),
      reorderQuantity: z.number(),
      unit: z.string(),
      lastSupplierName: z.string().optional(),
      farmDistrict: z.string().optional(),
    }),
    outputSchema: RfqDetailsSchema,
  },
  async (input) => {
    const supplierLine = input.lastSupplierName
      ? `Last bought from: ${input.lastSupplierName}.`
      : `No previous supplier on record.`;
    const districtLine = input.farmDistrict
      ? `Farm district: ${input.farmDistrict}.`
      : "";

    const prompt = `INVENTORY CONTEXT
Item: ${input.itemName}${input.itemType ? ` (${input.itemType})` : ""}
Current stock: ${input.currentQuantity} ${input.unit}
Reorder quantity (what we typically order): ${input.reorderQuantity} ${input.unit}
${supplierLine}
${districtLine}

YOUR TASK
1. Recommend the order quantity. Base on the reorder quantity unless current stock is already very low (<25% of reorder), in which case bump it slightly.
2. Build 3 tiers: alone, group of ~5, group of ~10.
3. Draft the supplier message in BM (with English product name kept as-is). Ask the supplier to quote prices for all 3 tiers AND any bulk discount they offer. Sign off as "[Farmer]" — the farmer will replace this with their actual name before sending.

Output JSON only.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      system: RFQ_SYSTEM,
      prompt,
      output: { schema: RfqDetailsSchema },
      config: { temperature: 0.4 },
    });

    if (!output) {
      // Fallback: deterministic draft so the chat doesn't break on a model failure
      return {
        recommendedQuantity: input.reorderQuantity,
        unit: input.unit,
        quantityTiers: [
          { qty: input.reorderQuantity, label: "Just for me" },
          { qty: input.reorderQuantity * 5, label: "Group of 5 farmers" },
          { qty: input.reorderQuantity * 10, label: "Group of 10 farmers" },
        ],
        copyToClipboardMessage:
          `Salam tuan,\n\nSaya nak tanya harga untuk ${input.itemName}:\n` +
          `- ${input.reorderQuantity} ${input.unit} (sendiri)\n` +
          `- ${input.reorderQuantity * 5} ${input.unit} (group 5 orang)\n` +
          `- ${input.reorderQuantity * 10} ${input.unit} (group 10 orang)\n\n` +
          `Tuan ada bulk discount? Terima kasih.\n\n[Farmer]`,
        summary: `Drafted RFQ for ${input.reorderQuantity} ${input.unit} ${input.itemName} (with bulk tiers)`,
      };
    }

    return output;
  }
);

// ─── 2. Supplier quote parse + bulk-discount decision ──────────

const QuoteTierSchema = z.object({
  qty: z.number(),
  unit: z.string(),
  pricePerUnitRm: z.number(),
});

const ParsedSupplierQuoteSchema = z.object({
  vendorName: z.string().nullable(),
  vendorContact: z.string().nullable(),
  /** All tiered prices the supplier offered — sorted ascending by qty */
  tiers: z.array(QuoteTierSchema),
  /** AI's call: did the supplier offer a meaningful bulk discount? (>10% at any tier) */
  bulkDiscountDetected: z.boolean(),
  /** One-sentence reasoning: "Discount of 18% at 5+ sacks" or "All tiers at the same price" */
  bulkDiscountReasoning: z.string(),
  /** AI's confidence that it parsed the document correctly (0-1) */
  parseConfidence: z.number().min(0).max(1),
  /** Free-text fallback: when the doc is hard to parse, dump the raw text here */
  rawNotes: z.string().nullable(),
});

export type ParsedSupplierQuote = z.infer<typeof ParsedSupplierQuoteSchema>;

const QUOTE_SYSTEM = `You are extracting tier-pricing data from a Malaysian agricultural supplier's quotation. The document may arrive in any of these formats:
  - PDF quote (printed or photo-scanned)
  - Image (WhatsApp screenshot, photo of a paper quote, photo of a thermal printout)
  - Plain text pasted from WhatsApp / Telegram / SMS
  - Word / Excel doc text

ABSOLUTE RULES:
1. Extract every distinct quantity-price tier the supplier offered. Sort ascending by qty.
2. Currency is always RM unless explicitly stated.
3. If the supplier quoted ONE flat price ("RM 95 per sack"), return one tier.
4. Bulk discount detection: >= 10% lower price-per-unit at the highest tier vs the lowest tier.
5. parseConfidence: 1.0 if every tier is unambiguous; 0.5 if some prices are inferred; 0.2 if the document is mostly unreadable.
6. If you cannot parse anything, return tiers=[] and put the raw legible text in rawNotes.
7. Output JSON matching the schema. No prose, no markdown.`;

export const parseSupplierQuoteFlow = ai.defineFlow(
  {
    name: "parseSupplierQuote",
    inputSchema: z.object({
      itemName: z.string(),
      // One of these two MUST be set:
      photoBase64: z.string().optional(),
      photoMimeType: z.string().optional(),
      textBody: z.string().optional(),
    }),
    outputSchema: ParsedSupplierQuoteSchema,
  },
  async (input) => {
    const promptText = `EXPECTED ITEM: ${input.itemName}

Extract every quantity / price tier the supplier offered for this item. If multiple items are quoted, focus on tiers matching "${input.itemName}". Output JSON only.`;

    const promptParts: ({ text: string } | { media: { contentType: string; url: string } })[] = [
      { text: promptText },
    ];

    if (input.photoBase64 && input.photoMimeType) {
      promptParts.push({
        media: {
          contentType: input.photoMimeType,
          url: `data:${input.photoMimeType};base64,${input.photoBase64}`,
        },
      });
    } else if (input.textBody) {
      promptParts.push({
        text: `\n\n--- SUPPLIER MESSAGE / DOC TEXT ---\n${input.textBody}`,
      });
    } else {
      throw new Error(
        "parseSupplierQuoteFlow: must provide either photo OR textBody"
      );
    }

    const { output } = await ai.generate({
      model: DISEASE_MODEL, // use the higher-fidelity model for parsing
      system: QUOTE_SYSTEM,
      prompt: promptParts,
      output: { schema: ParsedSupplierQuoteSchema },
      config: { temperature: 0.15 },
    });

    if (!output) {
      return {
        vendorName: null,
        vendorContact: null,
        tiers: [],
        bulkDiscountDetected: false,
        bulkDiscountReasoning: "Unable to parse the supplier's reply.",
        parseConfidence: 0,
        rawNotes: input.textBody ?? null,
      };
    }

    // Sort tiers ascending by qty (defensive — model might forget)
    output.tiers = [...output.tiers].sort((a, b) => a.qty - b.qty);
    return output;
  }
);

// ─── 2b. Group buy proposal from a parsed quote ────────────────

const GroupBuyProposalSchema = z.object({
  /** Suggested deadline in ISO 8601 (typically 3-7 days out — long enough for
   *  district neighbours to notice + opt in, short enough to keep urgency). */
  closesAtIso: z.string(),
  /** Minimum participants to make the bulk-buy worthwhile (typically the
   *  number that hits the discount tier). */
  minParticipants: z.number(),
  /** Target consolidated quantity (sum across farmers) — usually the
   *  qty that triggers the best price tier. */
  targetTotalQty: z.number(),
  unit: z.string(),
  /** AI's chosen tier for the group buy (the price the supplier offered
   *  at this targetTotalQty). */
  bulkPricePerUnitRm: z.number(),
  /** Lead-item description for the group buy card. */
  itemName: z.string(),
  /** One-line pitch surfaced on the join card. */
  pitch: z.string(),
});

export type GroupBuyProposal = z.infer<typeof GroupBuyProposalSchema>;

const PROPOSAL_SYSTEM = `You are deciding whether a Malaysian smallholder farmer should turn a supplier's bulk-discount quote into a district group buy and, if so, with what target quantity + deadline.

ABSOLUTE RULES:
1. Pick the tier that gives the best price-per-unit. That tier's qty becomes targetTotalQty + the price becomes bulkPricePerUnitRm.
2. minParticipants = ceil(targetTotalQty / per-farmer typical reorder qty), with floor of 3 (sub-3 is not a group buy).
3. Deadline: 3-7 days from now. Lean shorter (3 days) if the discount is huge (>25%); longer (7 days) if marginal (10-15%).
4. Pitch: a one-line BM-leaning hook the farmer can paste in the village WhatsApp group ("Group buy NPK 15-15-15 — RM 8 less per sack kalau cukup 5 orang").
5. Output JSON only.`;

export const proposeGroupBuyFromQuoteFlow = ai.defineFlow(
  {
    name: "proposeGroupBuyFromQuote",
    inputSchema: z.object({
      itemName: z.string(),
      supplierName: z.string().nullable().optional(),
      tiers: z.array(
        z.object({
          qty: z.number(),
          unit: z.string(),
          pricePerUnitRm: z.number(),
        })
      ),
      farmerTypicalReorderQty: z.number(),
    }),
    outputSchema: GroupBuyProposalSchema,
  },
  async (input) => {
    const tierLines = input.tiers
      .map(
        (t, i) =>
          `Tier ${i + 1}: ${t.qty} ${t.unit} @ RM ${t.pricePerUnitRm.toFixed(2)}/${t.unit}`
      )
      .join("\n");
    const todayIso = new Date().toISOString();

    const prompt = `ITEM: ${input.itemName}
Supplier: ${input.supplierName ?? "(unknown)"}
Today: ${todayIso}
Farmer's typical reorder qty (alone): ${input.farmerTypicalReorderQty} ${input.tiers[0]?.unit ?? "unit"}

SUPPLIER TIER PRICING:
${tierLines}

Pick the best bulk tier and propose a group buy. Output JSON only.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      system: PROPOSAL_SYSTEM,
      prompt,
      output: { schema: GroupBuyProposalSchema },
      config: { temperature: 0.3 },
    });

    if (!output) {
      // Fallback: pick the lowest price-per-unit tier deterministically.
      const sorted = [...input.tiers].sort(
        (a, b) => a.pricePerUnitRm - b.pricePerUnitRm
      );
      const best = sorted[0] ?? {
        qty: input.farmerTypicalReorderQty * 5,
        unit: "unit",
        pricePerUnitRm: 0,
      };
      const closesAt = new Date();
      closesAt.setDate(closesAt.getDate() + 5);
      const minParticipants = Math.max(
        3,
        Math.ceil(best.qty / Math.max(1, input.farmerTypicalReorderQty))
      );
      return {
        closesAtIso: closesAt.toISOString(),
        minParticipants,
        targetTotalQty: best.qty,
        unit: best.unit,
        bulkPricePerUnitRm: best.pricePerUnitRm,
        itemName: input.itemName,
        pitch: `Group buy ${input.itemName} — RM ${best.pricePerUnitRm.toFixed(2)}/${best.unit} kalau cukup ${minParticipants} orang. Tutup ${closesAt.toLocaleDateString("en-MY")}.`,
      };
    }
    return output;
  }
);

// ─── 3. Consolidated PO draft flow (group buy ended) ────────────

const ConsolidatedPoDetailsSchema = z.object({
  summary: z.string(),
  copyToClipboardMessage: z.string(),
  deliveryInstructions: z.string(),
});

export type ConsolidatedPoDetails = z.infer<typeof ConsolidatedPoDetailsSchema>;

const PO_SYSTEM = `You are drafting a Purchase Order message a Malaysian smallholder farmer will send to a supplier on behalf of a group buy.

ABSOLUTE RULES:
1. The "copyToClipboardMessage" is what the farmer will paste to the supplier. SHORT, POLITE, BM-leaning. Confirms quantity per item, total, agreed bulk price, requested delivery date.
2. The "deliveryInstructions" is the consolidated delivery plan (shared pickup at one address vs. per-farmer delivery). Format clearly so the supplier knows exactly where to deliver each chunk.
3. Output JSON matching the schema. No prose, no markdown.`;

export const draftConsolidatedPoFlow = ai.defineFlow(
  {
    name: "draftConsolidatedPo",
    inputSchema: z.object({
      supplierName: z.string().optional(),
      itemSummary: z.array(
        z.object({
          itemName: z.string(),
          totalQuantity: z.number(),
          unit: z.string(),
          pricePerUnitRm: z.number(),
        })
      ),
      participantCount: z.number(),
      grandTotalRm: z.number(),
      addressMode: z.enum(["shared", "per_farmer"]),
      addresses: z.array(z.string()), // for shared, len=1; for per_farmer, len=N
    }),
    outputSchema: ConsolidatedPoDetailsSchema,
  },
  async (input) => {
    const itemLines = input.itemSummary
      .map(
        (i) =>
          `- ${i.itemName}: ${i.totalQuantity} ${i.unit} @ RM ${i.pricePerUnitRm.toFixed(2)}/${i.unit}`
      )
      .join("\n");
    const supplierLine = input.supplierName
      ? `Supplier: ${input.supplierName}`
      : "Supplier: (unknown)";
    const addressBlock =
      input.addressMode === "shared"
        ? `Shared pickup at:\n${input.addresses[0] ?? "(address pending)"}`
        : `Deliveries to ${input.addresses.length} farms:\n` +
          input.addresses.map((a, i) => `${i + 1}. ${a}`).join("\n");

    const prompt = `${supplierLine}
Items:
${itemLines}
Participants: ${input.participantCount} farmers
Grand total: RM ${input.grandTotalRm.toFixed(2)}
${addressBlock}

Draft the PO confirmation message + delivery instructions. Output JSON only.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      system: PO_SYSTEM,
      prompt,
      output: { schema: ConsolidatedPoDetailsSchema },
      config: { temperature: 0.3 },
    });

    if (!output) {
      // Fallback deterministic draft
      const summary = `Group buy PO: ${input.participantCount} farmers, RM ${input.grandTotalRm.toFixed(2)} total`;
      const msg =
        `Salam tuan,\n\nKami nak confirm order group buy:\n${itemLines}\n\nTotal: RM ${input.grandTotalRm.toFixed(2)} untuk ${input.participantCount} orang petani.\n\n${addressBlock}\n\nBoleh tuan confirm + bagi tarikh delivery? Terima kasih.\n\n[Group buy initiator]`;
      return {
        summary,
        copyToClipboardMessage: msg,
        deliveryInstructions: addressBlock,
      };
    }
    return output;
  }
);
