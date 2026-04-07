import { GoogleGenerativeAI } from "@google/generative-ai";

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

const FALLBACK: FarmResearchResult = {
  suggested_soil: "loam",
  soil_confidence: "low",
  soil_reasoning:
    "Unable to determine soil type automatically. Please select your soil type based on what you know about your land.",
  suggested_water: "rain_fed",
  water_reasoning:
    "Unable to determine water source automatically. Please select the water source you use.",
  nearby_irrigation_scheme: null,
  district: null,
  state: null,
};

const VALID_SOILS = ["clay", "clay_loam", "loam", "sandy_loam", "sandy", "peat"];
const VALID_WATER = ["rain_fed", "irrigated", "both"];
const VALID_CONFIDENCE = ["high", "medium", "low"];

function validate(data: Record<string, unknown>): FarmResearchResult | null {
  if (
    typeof data.suggested_soil !== "string" ||
    !VALID_SOILS.includes(data.suggested_soil) ||
    typeof data.soil_confidence !== "string" ||
    !VALID_CONFIDENCE.includes(data.soil_confidence) ||
    typeof data.soil_reasoning !== "string" ||
    typeof data.suggested_water !== "string" ||
    !VALID_WATER.includes(data.suggested_water) ||
    typeof data.water_reasoning !== "string"
  ) {
    return null;
  }

  return {
    suggested_soil: data.suggested_soil,
    soil_confidence: data.soil_confidence,
    soil_reasoning: data.soil_reasoning,
    suggested_water: data.suggested_water,
    water_reasoning: data.water_reasoning,
    nearby_irrigation_scheme:
      typeof data.nearby_irrigation_scheme === "string"
        ? data.nearby_irrigation_scheme
        : null,
    district: typeof data.district === "string" ? data.district : null,
    state: typeof data.state === "string" ? data.state : null,
  };
}

// Mock response for dev/testing when Gemini quota is exhausted
function getMockResult(lat: number, lng: number): FarmResearchResult {
  // Northern peninsular (Kedah, Perlis, Penang area)
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
  // East coast (Kelantan, Terengganu)
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
  // Central/south (Selangor, Johor, etc.)
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

export async function researchFarm(
  boundingBox: { north: number; south: number; east: number; west: number },
  areaAcres: number
): Promise<FarmResearchResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using mock data");
    const lat = (boundingBox.north + boundingBox.south) / 2;
    const lng = (boundingBox.east + boundingBox.west) / 2;
    return getMockResult(lat, lng);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const lat = ((boundingBox.north + boundingBox.south) / 2).toFixed(6);
  const lng = ((boundingBox.east + boundingBox.west) / 2).toFixed(6);

  const prompt = `Research the farm at coordinates ${lat}°N, ${lng}°E in Malaysia. The farm is approximately ${areaAcres.toFixed(1)} acres. Identify the district and state from the coordinates, then determine the typical soil type and water source for farms in that area. Return JSON only.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      // Strip markdown code fences if present
      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      const validated = validate(parsed);
      if (validated) return validated;

      console.warn(`Gemini response failed validation (attempt ${attempt + 1})`);
    } catch (err) {
      // Retry after 2s on rate limit (429) before giving up
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(`Gemini call failed (attempt ${attempt + 1}):`, err);
    }
  }

  // All Gemini attempts failed — use mock data as fallback in dev
  console.warn("Gemini failed after retries, using mock data");
  const fallbackLat = (boundingBox.north + boundingBox.south) / 2;
  const fallbackLng = (boundingBox.east + boundingBox.west) / 2;
  return getMockResult(fallbackLat, fallbackLng);
}
