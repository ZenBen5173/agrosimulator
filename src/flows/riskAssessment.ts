import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { weatherTool, plotsTool, plotHistoryTool } from "@/lib/tools";

const PlotRiskSchema = z.object({
  label: z.string(),
  risk_score: z.number(),
  warning_level: z.enum(["none", "yellow", "orange", "red"]),
  warning_reason: z.string(),
});

const OutputSchema = z.object({
  plots: z.array(PlotRiskSchema),
});

export type RiskAssessmentOutput = z.infer<typeof OutputSchema>;

export const riskAssessmentFlow = ai.defineFlow(
  {
    name: "riskAssessment",
    inputSchema: z.object({ farmId: z.string().uuid() }),
    outputSchema: OutputSchema,
  },
  async ({ farmId }) => {
    // Gather context
    const [plots, weather] = await Promise.all([
      plotsTool({ farmId }),
      weatherTool({ farmId }),
    ]);

    // Get history for each plot
    const plotHistories = await Promise.all(
      plots.map(async (p) => {
        const history = await plotHistoryTool({ plotId: p.id });
        return { plot: p, history };
      })
    );

    const plotSummary = plotHistories
      .map(({ plot: p, history }) => {
        const events =
          history.length > 0
            ? history
                .slice(0, 5)
                .map(
                  (e) =>
                    `${e.event_type}${e.disease_name ? ` (${e.disease_name}, ${e.severity})` : ""} on ${e.created_at.split("T")[0]}`
                )
                .join("; ")
            : "no recent events";
        return `- ${p.label}: ${p.crop_name} (${p.growth_stage}), last inspected ${p.days_since_checked ?? "never"} days ago, events: ${events}`;
      })
      .join("\n");

    const prompt = `Assess disease and stress risk for each plot on a Malaysian smallholder farm.

Weather: ${weather.condition}, ${weather.temp_celsius}°C, humidity ${weather.humidity_pct}%, rainfall ${weather.rainfall_mm}mm
Forecast: ${weather.forecast.map((f) => `${f.date}: ${f.condition} (${f.rain_chance}% rain)`).join(", ") || "unavailable"}

Plots:
${plotSummary}

Risk factors:
- Consecutive rainy days → fungal risk
- High humidity (>85%) + warm (>28°C) → elevated risk
- Days since inspection (>7 = yellow, >14 = orange)
- Past disease events → higher risk
- Growth stage vulnerability

Return JSON:
{
  "plots": [
    {
      "label": "string",
      "risk_score": 0.0-1.0,
      "warning_level": "none|yellow|orange|red",
      "warning_reason": "1 sentence, specific to the crop and risk factor"
    }
  ]
}

Rules: 0.0-0.3→none, 0.3-0.5→yellow, 0.5-0.8→orange, 0.8-1.0→red (only with active disease)`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      prompt,
      output: { schema: OutputSchema },
      config: { temperature: 0.2 },
    });

    if (output) return output;

    // Fallback
    return {
      plots: plots.map((p) => ({
        label: p.label,
        risk_score: 0.2,
        warning_level: "none" as const,
        warning_reason: `${p.crop_name} looks healthy.`,
      })),
    };
  }
);
