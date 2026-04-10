/**
 * Farm research service — retrofitted to use Genkit.
 * Keeps the same exported interface so API routes don't change.
 */
import { ai, DEFAULT_MODEL } from "@/lib/genkit";
import { z } from "genkit";

const SYSTEM_INSTRUCTION = `You are a Malaysian agricultural soil expert. Given GPS coordinates of a farm in Malaysia, identify the district and state, then research the typical soil type and water source for that area. Consider proximity to irrigation schemes (MADA, KADA, IADA, etc.) and typical geological profiles.

Return ONLY valid JSON matching this exact schema — no prose, no markdown, no explanation outside the JSON:
{
  "suggested_soil": "clay" | "clay_loam" | "loam" | "sandy_loam" | "sandy" | "peat",
  "soil_confidence": "high" | "medium" | "low",
  "soil_reasoning": "max 2 sentences, plain English, no jargon",
  "suggested_water": "rain_fed" | "irrigated" | "both",
  "water_reasoning": "max 2 sentences, plain English, no jargon",
  "nearby_irrigation_scheme": "string or null (e.g. MADA, KADA, or null if none nearby)",
  "district": "the Malaysian district name",
  "state": "the Malaysian state name"
}`;

export interface FarmResearchResult {
  suggested_soil: string;
  soil_confidence: string;
  soil_reasoning: string;
  suggested_water: string;
  water_reasoning: string;
  nearby_irrigation_scheme: string | null;
  district: string | null;
  state: string | null;
}

const OutputSchema = z.object({
  suggested_soil: z.enum(["clay", "clay_loam", "loam", "sandy_loam", "sandy", "peat"]),
  soil_confidence: z.enum(["high", "medium", "low"]),
  soil_reasoning: z.string(),
  suggested_water: z.enum(["rain_fed", "irrigated", "both"]),
  water_reasoning: z.string(),
  nearby_irrigation_scheme: z.string().nullable(),
  district: z.string().nullable(),
  state: z.string().nullable(),
});

// ─── Genkit Flow ────────────────────────────────────────────

export const researchFarmFlow = ai.defineFlow(
  {
    name: "researchFarm",
    inputSchema: z.object({
      lat: z.number(),
      lng: z.number(),
      areaAcres: z.number(),
    }),
    outputSchema: OutputSchema,
  },
  async ({ lat, lng, areaAcres }): Promise<z.infer<typeof OutputSchema>> => {
    const prompt = `Research the farm at coordinates ${lat.toFixed(6)}°N, ${lng.toFixed(6)}°E in Malaysia. The farm is approximately ${areaAcres.toFixed(1)} acres. Identify the district and state from the coordinates, then determine the typical soil type and water source for farms in that area. Return JSON only.`;

    const { output } = await ai.generate({
      model: DEFAULT_MODEL,
      system: SYSTEM_INSTRUCTION,
      prompt,
      output: { schema: OutputSchema },
      config: { temperature: 0.3 },
    });

    if (output) return output;

    const mock = getMockResult(lat, lng);
    return {
      ...mock,
      suggested_soil: mock.suggested_soil as "clay" | "clay_loam" | "loam" | "sandy_loam" | "sandy" | "peat",
      soil_confidence: mock.soil_confidence as "high" | "medium" | "low",
      suggested_water: mock.suggested_water as "rain_fed" | "irrigated" | "both",
    };
  }
);

// ─── Mock fallback ──────────────────────────────────────────

function getMockResult(lat: number, lng: number): FarmResearchResult {
  if (lat > 5.5) {
    return {
      suggested_soil: "clay",
      soil_confidence: "high",
      soil_reasoning:
        "The northern plains of Kedah are predominantly clay soils, ideal for wet paddy cultivation in the MADA irrigation zone.",
      suggested_water: "irrigated",
      water_reasoning:
        "This area falls within the MADA (Muda Agricultural Development Authority) irrigation scheme, providing year-round water supply.",
      nearby_irrigation_scheme: "MADA",
      district: "Alor Setar",
      state: "Kedah",
    };
  }
  if (lng > 102.5) {
    return {
      suggested_soil: "sandy_loam",
      soil_confidence: "medium",
      soil_reasoning:
        "East coast farms typically have sandy loam soils from coastal sediment deposits, suitable for mixed crops and some paddy.",
      suggested_water: "rain_fed",
      water_reasoning:
        "Most farms in this region rely on monsoon rainfall. The northeast monsoon brings heavy rain from November to March.",
      nearby_irrigation_scheme: null,
      district: "Kota Bharu",
      state: "Kelantan",
    };
  }
  return {
    suggested_soil: "clay_loam",
    soil_confidence: "medium",
    soil_reasoning:
      "Central peninsular Malaysia has clay loam soils from weathered granite, good for a wide range of crops including oil palm and rubber.",
    suggested_water: "both",
    water_reasoning:
      "This area has moderate rainfall year-round with some farms accessing IADA irrigation schemes.",
    nearby_irrigation_scheme: "IADA",
    district: "Kuala Selangor",
    state: "Selangor",
  };
}

// ─── Public API (unchanged signature) ───────────────────────

export async function researchFarm(
  boundingBox: { north: number; south: number; east: number; west: number },
  areaAcres: number
): Promise<FarmResearchResult> {
  const lat = (boundingBox.north + boundingBox.south) / 2;
  const lng = (boundingBox.east + boundingBox.west) / 2;

  try {
    return await researchFarmFlow({ lat, lng, areaAcres });
  } catch (err) {
    console.warn("Genkit researchFarm failed, using mock:", err);
    return getMockResult(lat, lng);
  }
}
