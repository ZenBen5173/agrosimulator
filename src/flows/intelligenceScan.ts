import { z } from "genkit";
import { ai, DEFAULT_MODEL } from "@/lib/genkit";

const AlertSchema = z.object({
  title: z.string(),
  summary: z.string(),
  severity: z.enum(["critical", "high", "medium", "low"]),
  affected_crops: z.array(z.string()),
  affected_regions: z.array(z.string()),
  recommended_action: z.string(),
  source_type: z.enum(["news", "weather_pattern", "community_outbreak"]),
});

const OutputSchema = z.object({
  alerts: z.array(AlertSchema),
  scan_timestamp: z.string(),
});

export type IntelligenceScanOutput = z.infer<typeof OutputSchema>;

export const intelligenceScanFlow = ai.defineFlow(
  {
    name: "intelligenceScan",
    inputSchema: z.object({
      region: z.string().optional(),
      crops: z.array(z.string()).optional(),
    }),
    outputSchema: OutputSchema,
  },
  async ({ region, crops }) => {
    const cropStr = crops?.join(", ") || "paddy, chilli, kangkung, banana, corn, sweet potato";
    const regionStr = region || "Peninsular Malaysia";

    const prompt = `You are a Malaysian agricultural intelligence agent. Search for and report the latest threats to farmers.

Search for:
1. Crop disease outbreaks in ${regionStr}
2. Fertilizer recalls or quality warnings
3. Pest invasions affecting ${cropStr}
4. Flood or drought warnings from MetMalaysia
5. MARDI, DOA, Jabatan Pertanian advisories

For each threat found, provide:
- A clear title
- 1-2 sentence summary
- Severity (critical/high/medium/low)
- Which crops are affected
- Which regions are affected
- What the farmer should do

Return JSON:
{
  "alerts": [
    {
      "title": "string",
      "summary": "string",
      "severity": "critical|high|medium|low",
      "affected_crops": ["Paddy", "Chilli"],
      "affected_regions": ["Kedah", "Perlis"],
      "recommended_action": "string",
      "source_type": "news|weather_pattern|community_outbreak"
    }
  ],
  "scan_timestamp": "${new Date().toISOString()}"
}

If no current threats, return empty alerts array. Do NOT invent threats.`;

    try {
      const { output } = await ai.generate({
        model: DEFAULT_MODEL,
        prompt,
        output: { schema: OutputSchema },
        config: {
          temperature: 0.2,
        },
      });

      if (output) return output;
    } catch (err) {
      console.error("Intelligence scan failed:", err);
    }

    return {
      alerts: [],
      scan_timestamp: new Date().toISOString(),
    };
  }
);
