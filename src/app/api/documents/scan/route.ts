import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { z } from "genkit";

const ScanOutputSchema = z.object({
  document_type: z.enum([
    "supplier_invoice", "supplier_receipt", "supplier_quotation", "delivery_order",
    "purchase_order", "customer_invoice", "customer_receipt", "unknown",
  ]),
  direction: z.enum(["purchase", "sale"]),
  contact_name: z.string().nullable(),
  contact_phone: z.string().nullable(),
  document_number: z.string().nullable(),
  document_date: z.string().nullable(),
  due_date: z.string().nullable(),
  items: z.array(z.object({
    item_name: z.string(),
    item_type: z.enum(["fertilizer", "pesticide", "seed", "tool", "crop", "other"]),
    quantity: z.number(),
    unit: z.string(),
    unit_price_rm: z.number(),
    total_rm: z.number(),
  })),
  total_amount_rm: z.number(),
  notes: z.string().nullable(),
  confidence: z.number(),
});

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { farm_id, photo_base64, mime_type } = await request.json();
    if (!farm_id || !photo_base64 || !mime_type) {
      return NextResponse.json({ error: "farm_id, photo_base64, mime_type required" }, { status: 400 });
    }

    const prompt = `You are an AI accounts assistant for a Malaysian farmer. Analyze this business document photo.

Identify what type of document this is:
- supplier_invoice: A bill from a supplier for goods/services
- supplier_receipt: A payment receipt from a supplier
- supplier_quotation: A price quote from a supplier
- delivery_order: A delivery note for goods sent/received
- purchase_order: An order placed to a supplier
- customer_invoice: An invoice sent to a buyer/customer
- customer_receipt: A payment receipt from a customer
- unknown: Cannot determine

Extract ALL information:
- Contact name (supplier or customer)
- Contact phone number
- Document number (invoice no, receipt no, DO no, etc)
- Document date
- Due date (if applicable)
- Line items: item name, type (fertilizer/pesticide/seed/tool/crop/other), quantity, unit, unit price, total
- Total amount
- Any notes or terms

Handle: handwritten BM/English, thermal printed, WhatsApp screenshots, formal typed.
Common BM: "Baja" = Fertilizer, "Racun" = Pesticide, "Benih" = Seed, "Jumlah" = Total, "Tarikh" = Date.

Return JSON matching the schema.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt: [
        { text: prompt },
        { media: { contentType: mime_type, url: `data:${mime_type};base64,${photo_base64}` } },
      ],
      output: { schema: ScanOutputSchema },
      config: { temperature: 0.1 },
    });

    if (!output) {
      return NextResponse.json({ error: "Failed to analyze document" }, { status: 422 });
    }

    return NextResponse.json(output);
  } catch (err) {
    console.error("Document scan error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
