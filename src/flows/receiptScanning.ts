/**
 * AgroSim 2.0 — Receipt scanning Genkit flow.
 *
 * Takes a photo of a Malaysian agri-shop receipt (BM/English/handwritten/
 * thermal/phone screenshot) and returns structured line items, supplier,
 * date, and total. The pure-logic parser then normalises units, classifies
 * categories, computes confidences, and merges duplicates.
 *
 * Receipts are the marquee Books-layer feature — the second wow moment for
 * the demo (after the doctor-style diagnosis). Judges photograph a real
 * receipt in the app and watch inventory + accounting update.
 *
 * See AGROSIM_2.0.md section 4.2.
 */

import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";

// ─── Output schema ──────────────────────────────────────────────

const RawReceiptSchema = z.object({
  supplierName: z.string().nullable(),
  receiptDate: z.string().nullable(), // ISO yyyy-mm-dd if possible
  totalAmountRm: z.number(),
  currency: z.string(), // expected "RM"
  items: z.array(
    z.object({
      rawText: z.string(),
      itemName: z.string(),
      brand: z.string().nullable(),
      quantity: z.number(),
      unit: z.string(),
      unitPriceRm: z.number().nullable(),
      totalRm: z.number(),
      confidenceItemName: z.number().min(0).max(1),
      confidenceQuantity: z.number().min(0).max(1),
      confidenceTotal: z.number().min(0).max(1),
    })
  ),
  imageQuality: z.enum(["good", "acceptable", "poor", "unusable"]),
  observations: z.array(z.string()),
});

export type RawReceipt = z.infer<typeof RawReceiptSchema>;

// ─── System instruction ─────────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a careful receipt-extraction assistant for Malaysian agricultural-supply receipts. Receipts come in many forms: thermal printed, handwritten, phone screenshots, mixed Malay (BM) and English.

ABSOLUTE RULES:
1. Output ONLY JSON matching the provided schema. No prose, no markdown.
2. Be conservative with quantities and totals. If a number is unclear, set the corresponding confidence to a low value (0.4-0.6) instead of guessing.
3. Map common Malay terms: "Baja" = fertiliser, "Racun kulat" = fungicide, "Racun rumpai" = herbicide, "Racun serangga" = insecticide, "Benih" = seed.
4. Detect known brands: Dithane, Mancozeb, Antracol, Daconil, Tilt, Beam, Apron, NPK 15-15-15, Urea, Roundup, Paraquat, Glyphosate.
5. Currency is always RM unless explicitly stated.
6. Receipt date format: convert to yyyy-mm-dd. If only partially visible, return null.
7. If the image quality is poor or the receipt is unreadable, set imageQuality accordingly and keep all confidences low.

You are NOT recommending or interpreting — you are transcribing what the receipt says.`;

// ─── The flow ───────────────────────────────────────────────────

export const scanReceiptFlow = ai.defineFlow(
  {
    name: "scanReceipt",
    inputSchema: z.object({
      photoBase64: z.string(),
      photoMimeType: z.string(),
    }),
    outputSchema: RawReceiptSchema,
  },
  async ({ photoBase64, photoMimeType }) => {
    const promptText = `Extract the contents of this Malaysian agricultural receipt.

Return JSON exactly matching this schema:
{
  "supplierName": string | null  (the shop / supplier name at top of receipt),
  "receiptDate": string | null   (ISO yyyy-mm-dd if extractable, else null),
  "totalAmountRm": number        (the FINAL total in RM at the bottom),
  "currency": string             (always "RM" unless receipt explicitly says otherwise),
  "items": [
    {
      "rawText": string         (the literal text as printed),
      "itemName": string        (cleaned name — the product, e.g. "Mancozeb 80% WP"),
      "brand": string | null    (e.g. "Dithane M-45" or null),
      "quantity": number,
      "unit": string            (e.g. "kg", "litre", "sack", "packet", "bottle"),
      "unitPriceRm": number | null,
      "totalRm": number,
      "confidenceItemName": number 0-1,
      "confidenceQuantity": number 0-1,
      "confidenceTotal": number 0-1
    }
  ],
  "imageQuality": "good" | "acceptable" | "poor" | "unusable",
  "observations": [string]    (what you literally see — supplier type, language, paper kind)
}

Be conservative with confidence. Better to flag a field for verification than to assert a wrong number.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      system: SYSTEM_INSTRUCTION,
      prompt: [
        { text: promptText },
        {
          media: {
            contentType: photoMimeType,
            url: `data:${photoMimeType};base64,${photoBase64}`,
          },
        },
      ],
      output: { schema: RawReceiptSchema },
      config: { temperature: 0.1 }, // very low — we want consistency
    });

    if (output) {
      return output;
    }

    return {
      supplierName: null,
      receiptDate: null,
      totalAmountRm: 0,
      currency: "RM",
      items: [],
      imageQuality: "unusable" as const,
      observations: ["Model returned no structured output — receipt may be unreadable."],
    };
  }
);
