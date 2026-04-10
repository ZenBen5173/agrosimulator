import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import {
  weatherTool,
  plotHistoryTool,
  marketPricesTool,
  getFarmContextTool,
} from "@/lib/tools";

const WeekScheduleSchema = z.object({
  week: z.number(),
  phase: z.string(),
  tasks: z.array(z.string()),
});

const OutputSchema = z.object({
  recommended_crop: z.string(),
  reason: z.string(),
  planting_window: z.string(),
  estimated_yield_kg: z.number(),
  estimated_days_to_harvest: z.number(),
  market_note: z.string().nullable(),
  weekly_schedule: z.array(WeekScheduleSchema),
});

export type PlantingRecommendationOutput = z.infer<typeof OutputSchema>;

export const plantingRecommendationFlow = ai.defineFlow(
  {
    name: "plantingRecommendation",
    inputSchema: z.object({
      farmId: z.string().uuid(),
      plotId: z.string().uuid(),
      plotLabel: z.string(),
      currentCrop: z.string(),
    }),
    outputSchema: OutputSchema,
  },
  async ({ farmId, plotId, plotLabel, currentCrop }) => {
    const [farm, weather, plotHistory, marketPrices] = await Promise.all([
      getFarmContextTool({ farmId }),
      weatherTool({ farmId }),
      plotHistoryTool({ plotId }),
      marketPricesTool({}),
    ]);

    const diseaseList =
      plotHistory
        .filter(
          (e) =>
            e.event_type === "inspection_disease" ||
            e.event_type === "inspection_suspicious"
        )
        .map(
          (e) =>
            `${e.event_type}${e.disease_name ? `: ${e.disease_name}` : ""}`
        )
        .join(", ") || "None";

    const marketList = marketPrices
      .filter((m) => m.item_type === "crop")
      .slice(0, 8)
      .map(
        (m) =>
          `${m.item_name}: RM${m.price_per_kg.toFixed(2)}/kg (${m.trend}${m.trend_pct ? ` ${m.trend_pct}%` : ""})`
      )
      .join(", ");

    const prompt = `Recommend the best crop to plant on a Malaysian smallholder farm plot.

Plot: ${plotLabel}, previous crop: ${currentCrop}
Location: ${farm.district || "Unknown"}, ${farm.state || "Unknown"}, Malaysia
Soil: ${farm.soil_type || "unknown"}, Water: ${farm.water_source || "unknown"}
Disease history: ${diseaseList}
Weather: ${weather.condition}, ${weather.temp_celsius}°C
Market prices: ${marketList || "No data"}

Consider crop rotation, soil suitability, water requirements, and market prices.

Return JSON:
{
  "recommended_crop": "Malaysian crop name",
  "reason": "2-3 sentences",
  "planting_window": "when to plant",
  "estimated_yield_kg": number,
  "estimated_days_to_harvest": number,
  "market_note": "string or null",
  "weekly_schedule": [
    { "week": 1, "phase": "Land preparation", "tasks": ["task1", "task2", "task3"] }
  ]
}

Weekly schedule must cover the full growing cycle (4-16 weeks).`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt,
      output: { schema: OutputSchema },
      config: { temperature: 0.4 },
    });

    if (output) return output;

    // Fallback
    return {
      recommended_crop: "Kangkung (Water Spinach)",
      reason:
        "Kangkung is fast-growing, tolerant of most soil types, and has steady market demand in Malaysia.",
      planting_window: "Plant within the next 2 weeks",
      estimated_yield_kg: 250,
      estimated_days_to_harvest: 30,
      market_note: null,
      weekly_schedule: [
        { week: 1, phase: "Land preparation", tasks: ["Clear soil", "Add compost", "Level beds"] },
        { week: 2, phase: "Planting", tasks: ["Sow seeds", "Water thoroughly", "Apply mulch"] },
        { week: 3, phase: "Growth", tasks: ["Water daily", "Monitor pests", "Thin seedlings"] },
        { week: 4, phase: "Harvest", tasks: ["Harvest leaves", "Sort produce", "Prepare for market"] },
      ],
    };
  }
);
