import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { inventoryTool, plotsTool, resourceProfileTool } from "@/lib/tools";

const ReorderItemSchema = z.object({
  item_name: z.string(),
  current_quantity: z.number(),
  unit: z.string(),
  projected_days_until_empty: z.number(),
  recommended_order_quantity: z.number(),
  estimated_cost_rm: z.number().nullable(),
  urgency: z.enum(["immediate", "this_week", "next_week"]),
  supplier_name: z.string().nullable(),
});

const OutputSchema = z.object({
  reorder_items: z.array(ReorderItemSchema),
  total_estimated_cost_rm: z.number(),
  summary: z.string(),
});

export type InventoryReorderOutput = z.infer<typeof OutputSchema>;

export const inventoryReorderFlow = ai.defineFlow(
  {
    name: "inventoryReorder",
    inputSchema: z.object({ farmId: z.string().uuid() }),
    outputSchema: OutputSchema,
  },
  async ({ farmId }) => {
    const [inventory, plots] = await Promise.all([
      inventoryTool({ farmId }),
      plotsTool({ farmId }),
    ]);

    if (inventory.length === 0) {
      return {
        reorder_items: [],
        total_estimated_cost_rm: 0,
        summary: "No inventory items tracked yet. Add items to enable reorder alerts.",
      };
    }

    // Get resource profiles to estimate usage rates
    const usageEstimates = await Promise.all(
      plots.map(async (p) => {
        const profile = await resourceProfileTool({
          crop: p.crop_name,
          growth_stage: p.growth_stage,
        });
        return { plot: p, profile };
      })
    );

    const inventorySummary = inventory
      .map(
        (i) =>
          `- ${i.item_name} (${i.item_type}): ${i.current_quantity} ${i.unit}, ` +
          `reorder at: ${i.reorder_threshold ?? "not set"}, ` +
          `last price: ${i.last_purchase_price_rm ? `RM${i.last_purchase_price_rm}` : "unknown"}`
      )
      .join("\n");

    const usageSummary = usageEstimates
      .map(
        ({ plot: p, profile }) =>
          `- ${p.label} (${p.crop_name}, ${p.growth_stage}): ` +
          `needs ${profile.fertilizer_type || "none"} at ${profile.fertilizer_g_per_m2}g/m² every ${profile.fertilizer_frequency_days} days, ` +
          `pesticide: ${profile.pesticide_type || "none"}`
      )
      .join("\n");

    const prompt = `Analyse inventory levels and project when each item will run out.

Current inventory:
${inventorySummary}

Crop usage rates:
${usageSummary}

For each item below reorder threshold or projected to run out within 7 days:
1. Calculate days until empty based on usage rate
2. Recommend order quantity (2-4 weeks supply)
3. Estimate cost based on last purchase price
4. Set urgency: immediate (<3 days), this_week (3-7 days), next_week (7-14 days)

Return JSON:
{
  "reorder_items": [
    {
      "item_name": "string",
      "current_quantity": number,
      "unit": "string",
      "projected_days_until_empty": number,
      "recommended_order_quantity": number,
      "estimated_cost_rm": number or null,
      "urgency": "immediate|this_week|next_week",
      "supplier_name": "string or null"
    }
  ],
  "total_estimated_cost_rm": number,
  "summary": "1-2 sentence summary"
}

If all stock levels are healthy, return empty reorder_items.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt,
      output: { schema: OutputSchema },
      config: { temperature: 0.2 },
    });

    if (output) return output;

    // Fallback: check thresholds manually
    const lowItems = inventory.filter(
      (i) => i.reorder_threshold && i.current_quantity <= i.reorder_threshold
    );

    return {
      reorder_items: lowItems.map((i) => ({
        item_name: i.item_name,
        current_quantity: i.current_quantity,
        unit: i.unit,
        projected_days_until_empty: 3,
        recommended_order_quantity: (i.reorder_threshold || 10) * 2,
        estimated_cost_rm: i.last_purchase_price_rm
          ? i.last_purchase_price_rm * 2
          : null,
        urgency: "immediate" as const,
        supplier_name: null,
      })),
      total_estimated_cost_rm: lowItems.reduce(
        (sum, i) => sum + (i.last_purchase_price_rm || 0) * 2,
        0
      ),
      summary:
        lowItems.length > 0
          ? `${lowItems.length} items below reorder threshold.`
          : "All stock levels healthy.",
    };
  }
);
