import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { z } from "genkit";

const ReceiptItemSchema = z.object({
  item_name: z.string(),
  item_type: z.enum(["fertilizer", "pesticide", "seed", "tool", "other"]),
  quantity: z.number(),
  unit: z.string(),
  price_rm: z.number(),
  confidence: z.enum(["high", "medium", "low"]),
});

const ReceiptOutputSchema = z.object({
  supplier_name: z.string().nullable(),
  receipt_date: z.string().nullable(),
  items: z.array(ReceiptItemSchema),
  total_amount_rm: z.number(),
  overall_confidence: z.number(),
});

/**
 * POST — scan a receipt photo and extract items using Gemini Vision.
 * Returns extracted data for farmer confirmation.
 */
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const body = await request.json();
    const { farm_id, photo_base64, mime_type } = body;

    if (!farm_id || !photo_base64 || !mime_type) {
      return NextResponse.json({ error: "farm_id, photo_base64, mime_type required" }, { status: 400 });
    }

    const prompt = `You are reading a Malaysian agricultural supply receipt or invoice. Extract all items purchased.

Handle: handwritten BM receipts, thermal printed, WhatsApp screenshots, mixed BM/English.
Common BM translations: "Baja" = Fertilizer, "Racun kulat" = Fungicide, "Racun serangga" = Insecticide, "Benih" = Seeds.

Return JSON:
{
  "supplier_name": "string or null",
  "receipt_date": "YYYY-MM-DD or null",
  "items": [
    {
      "item_name": "full name in English",
      "item_type": "fertilizer|pesticide|seed|tool|other",
      "quantity": number,
      "unit": "kg|g|ml|L|pcs|bag",
      "price_rm": number (total price for this line, not unit price),
      "confidence": "high|medium|low"
    }
  ],
  "total_amount_rm": number,
  "overall_confidence": 0.0-1.0
}`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt: [
        { text: prompt },
        { media: { contentType: mime_type, url: `data:${mime_type};base64,${photo_base64}` } },
      ],
      output: { schema: ReceiptOutputSchema },
      config: { temperature: 0.1 },
    });

    if (!output) {
      return NextResponse.json({ error: "Failed to extract receipt data" }, { status: 422 });
    }

    // Save scan record
    const { data: scan } = await supabase
      .from("receipt_scans")
      .insert({
        farm_id,
        gemini_result: output,
        overall_confidence: output.overall_confidence,
        total_amount_rm: output.total_amount_rm,
        supplier_name: output.supplier_name,
        receipt_date: output.receipt_date,
      })
      .select()
      .single();

    return NextResponse.json({ scan_id: scan?.id, ...output });
  } catch (err) {
    console.error("Receipt scan error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
