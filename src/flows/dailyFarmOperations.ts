import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import {
  weatherTool,
  plotsTool,
  marketPricesTool,
  getFarmContextTool,
  inventoryTool,
  resourceProfileTool,
} from "@/lib/tools";

// ─── Output schema ──────────────────────────────────────────

const TaskSchema = z.object({
  title: z.string(),
  description: z.string(),
  task_type: z.enum([
    "inspection",
    "watering",
    "fertilizing",
    "treatment",
    "harvesting",
    "replanting",
    "farm_wide",
  ]),
  priority: z.enum(["urgent", "normal", "low"]),
  plot_label: z.string().nullable(),
  triggered_by: z.enum(["weather", "inspection_result", "growth_stage", "schedule"]),
  resource_item: z.string().nullable().optional(),
  resource_quantity: z.number().nullable().optional(),
  resource_unit: z.string().nullable().optional(),
  estimated_cost_rm: z.number().nullable().optional(),
  timing_recommendation: z.string().nullable().optional(),
});

const OutputSchema = z.object({
  tasks: z.array(TaskSchema),
  prep_summary: z.string().optional(),
  total_estimated_cost_rm: z.number().optional(),
});

export type DailyOperationsOutput = z.infer<typeof OutputSchema>;

// ─── Flow ───────────────────────────────────────────────────

export const dailyFarmOperationsFlow = ai.defineFlow(
  {
    name: "dailyFarmOperations",
    inputSchema: z.object({ farmId: z.string().uuid() }),
    outputSchema: OutputSchema,
  },
  async ({ farmId }) => {
    const todayStr = new Date().toISOString().split("T")[0];

    // Step 1: Gather all context via tools (autonomous tool calls)
    const [farm, plots, weather, marketPrices, inventory] = await Promise.all([
      getFarmContextTool({ farmId }),
      plotsTool({ farmId }),
      weatherTool({ farmId }),
      marketPricesTool({}),
      inventoryTool({ farmId }),
    ]);

    // Step 2: Get resource profiles for each active plot
    const resourceNeeds = await Promise.all(
      plots.map(async (p) => {
        const profile = await resourceProfileTool({
          crop: p.crop_name,
          growth_stage: p.growth_stage,
        });
        return { plot: p, profile };
      })
    );

    // Step 3: Build comprehensive context for Gemini
    const plotSummary = resourceNeeds
      .map(
        ({ plot: p, profile }) =>
          `- ${p.label}: ${p.crop_name} (${p.growth_stage}), warning: ${p.warning_level}, ` +
          `last checked: ${p.days_since_checked ?? "never"} days ago, ` +
          `needs ${profile.water_ml_per_m2_per_day}ml/m²/day water, ` +
          `fertilizer: ${profile.fertilizer_type || "none"} every ${profile.fertilizer_frequency_days} days`
      )
      .join("\n");

    const inventorySummary =
      inventory.length > 0
        ? inventory
            .map(
              (i) =>
                `- ${i.item_name}: ${i.current_quantity} ${i.unit}${
                  i.reorder_threshold && i.current_quantity <= i.reorder_threshold
                    ? " ⚠️ LOW STOCK"
                    : ""
                }`
            )
            .join("\n")
        : "No inventory tracked yet";

    const forecastStr = weather.forecast
      .map((f) => `${f.date}: ${f.condition} (${f.rain_chance}% rain)`)
      .join(", ");

    const prompt = `Today is ${todayStr}. Generate a daily operations plan for this Malaysian farm.

Farm: ${farm.name || "My Farm"}, ${farm.district || "Unknown"}, ${farm.state || "Unknown"}
Area: ${farm.area_acres} acres, Soil: ${farm.soil_type || "unknown"}, Water: ${farm.water_source || "unknown"}

Current weather: ${weather.condition}, ${weather.temp_celsius}°C, humidity ${weather.humidity_pct}%, rainfall ${weather.rainfall_mm}mm, wind ${weather.wind_kmh}km/h
Forecast: ${forecastStr || "unavailable"}

Plots:
${plotSummary}

Inventory:
${inventorySummary}

Market prices: ${marketPrices.slice(0, 8).map((m) => `${m.item_name}: RM${m.price_per_kg.toFixed(2)} (${m.trend})`).join(", ")}

Generate 3-7 prioritised tasks. For each task, calculate exact resource quantities needed based on the crop profiles. Include timing recommendations (e.g. "water after 5PM", "spray before 9AM"). Flag low-stock items. Keep titles short (max 8 words), descriptions 1 sentence.

Return JSON:
{
  "tasks": [
    {
      "title": "string",
      "description": "string",
      "task_type": "inspection|watering|fertilizing|treatment|harvesting|replanting|farm_wide",
      "priority": "urgent|normal|low",
      "plot_label": "A1" or null,
      "triggered_by": "weather|inspection_result|growth_stage|schedule",
      "resource_item": "string or null (e.g. 'NPK 15-15-15')",
      "resource_quantity": number or null (exact amount needed),
      "resource_unit": "string or null (e.g. 'g', 'ml', 'litres')",
      "estimated_cost_rm": number or null,
      "timing_recommendation": "string or null"
    }
  ],
  "prep_summary": "1-2 sentence summary of what to bring today",
  "total_estimated_cost_rm": number
}`;

    // Step 4: Call Gemini via Genkit
    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt,
      output: { schema: OutputSchema },
      config: { temperature: 0.3 },
    });

    if (output) return output;

    // Fallback if Gemini fails
    return {
      tasks: plots.slice(0, 5).map((p) => ({
        title: `Check ${p.crop_name} (${p.label})`,
        description: `Routine check for plot ${p.label}.`,
        task_type: "inspection" as const,
        priority: "normal" as const,
        plot_label: p.label,
        triggered_by: "schedule" as const,
        resource_item: null,
        resource_quantity: null,
        resource_unit: null,
        estimated_cost_rm: null,
        timing_recommendation: null,
      })),
      prep_summary: "Basic inspection round of all plots.",
      total_estimated_cost_rm: 0,
    };
  }
);
