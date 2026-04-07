import { GoogleGenerativeAI } from "@google/generative-ai";

interface PlotContext {
  label: string;
  crop_name: string;
  growth_stage: string;
  planted_date: string | null;
}

interface FarmContext {
  district: string | null;
  state: string | null;
  soil_type: string | null;
  water_source: string | null;
  area_acres: number;
}

interface DiseaseEvent {
  event_type: string;
  disease_name: string | null;
}

interface WeatherContext {
  condition: string;
  temp_celsius: number;
}

interface MarketItem {
  item_name: string;
  price_per_kg: number;
  trend: string;
  trend_pct: number;
}

interface WeekSchedule {
  week: number;
  phase: string;
  tasks: string[];
}

export interface PlantingPlan {
  recommended_crop: string;
  reason: string;
  planting_window: string;
  estimated_yield_kg: number;
  estimated_days_to_harvest: number;
  market_note: string | null;
  weekly_schedule: WeekSchedule[];
}

const SYSTEM_INSTRUCTION =
  "You are a Malaysian agricultural planning expert. Return ONLY valid JSON. No prose, no markdown.";

function buildPrompt(
  plot: PlotContext,
  farm: FarmContext,
  diseaseHistory: DiseaseEvent[],
  weather: WeatherContext | null,
  marketPrices: MarketItem[]
): string {
  const diseaseList =
    diseaseHistory.length > 0
      ? diseaseHistory
          .map((e) => `${e.event_type}${e.disease_name ? `: ${e.disease_name}` : ""}`)
          .join(", ")
      : "None";

  const marketList =
    marketPrices.length > 0
      ? marketPrices
          .map(
            (m) =>
              `${m.item_name}: RM${m.price_per_kg.toFixed(2)}/kg (${m.trend}${m.trend_pct ? ` ${m.trend_pct}%` : ""})`
          )
          .join(", ")
      : "No market data available";

  const weatherStr = weather
    ? `${weather.condition}, temperature: ${weather.temp_celsius}°C`
    : "Unknown";

  return `Recommend the best crop to plant on a Malaysian smallholder farm plot.

Plot context:
- Location: ${farm.district || "Unknown"}, ${farm.state || "Unknown"}, Malaysia
- Plot label: ${plot.label}, previous crop: ${plot.crop_name}
- Soil type: ${farm.soil_type || "unknown"}, water source: ${farm.water_source || "unknown"}
- Recent disease history: ${diseaseList}
- Current weather: ${weatherStr}
- Current market prices: ${marketList}

Consider crop rotation (avoid planting the same crop as before if disease was detected),
soil suitability, water requirements, and market prices.

Return JSON exactly:
{
  "recommended_crop": "string (Malaysian crop name)",
  "reason": "string (2-3 sentences, why this crop suits this plot right now)",
  "planting_window": "string (e.g. 'Plant within the next 2 weeks — soil moisture is good')",
  "estimated_yield_kg": number,
  "estimated_days_to_harvest": number,
  "market_note": "string or null (price opportunity if relevant)",
  "weekly_schedule": [
    {
      "week": 1,
      "phase": "string (e.g. Land preparation, Planting, Early growth, etc.)",
      "tasks": ["string (2-3 specific tasks for this week)"]
    }
  ]
}

The weekly_schedule must cover the full growing cycle (4-16 weeks depending on crop).`;
}

function validate(data: Record<string, unknown>): PlantingPlan | null {
  if (typeof data.recommended_crop !== "string" || !data.recommended_crop) return null;
  if (typeof data.reason !== "string" || !data.reason) return null;
  if (typeof data.planting_window !== "string") return null;
  if (typeof data.estimated_yield_kg !== "number") return null;
  if (typeof data.estimated_days_to_harvest !== "number") return null;
  if (!Array.isArray(data.weekly_schedule) || data.weekly_schedule.length < 4)
    return null;

  const schedule: WeekSchedule[] = [];
  for (const w of data.weekly_schedule) {
    const week = w as Record<string, unknown>;
    if (typeof week.week !== "number") return null;
    if (typeof week.phase !== "string") return null;
    if (!Array.isArray(week.tasks) || week.tasks.length === 0) return null;
    schedule.push({
      week: week.week,
      phase: week.phase,
      tasks: week.tasks.map((t: unknown) => String(t)),
    });
  }

  return {
    recommended_crop: data.recommended_crop,
    reason: data.reason,
    planting_window: data.planting_window,
    estimated_yield_kg: data.estimated_yield_kg,
    estimated_days_to_harvest: data.estimated_days_to_harvest,
    market_note:
      typeof data.market_note === "string" ? data.market_note : null,
    weekly_schedule: schedule,
  };
}

function getMockPlan(
  plot: PlotContext,
  diseaseHistory: DiseaseEvent[],
  marketPrices: MarketItem[]
): PlantingPlan {
  const hadDisease = diseaseHistory.some(
    (e) =>
      e.event_type === "inspection_disease" ||
      e.event_type === "inspection_suspicious"
  );

  // If disease was detected on previous crop, rotate to a different crop
  const previousCrop = plot.crop_name.toLowerCase();
  let crop: string;
  let reason: string;
  let days: number;
  let yieldKg: number;

  if (hadDisease && previousCrop.includes("paddy")) {
    crop = "Chilli (Cili Padi)";
    reason =
      "After paddy disease, rotating to chilli breaks the disease cycle. Chilli thrives in the current warm season and has strong market demand.";
    days = 90;
    yieldKg = 180;
  } else if (hadDisease) {
    crop = "Kangkung (Water Spinach)";
    reason =
      "Fast-growing kangkung helps break disease cycles while providing quick income. It's well-suited to Malaysian climate year-round.";
    days = 30;
    yieldKg = 250;
  } else if (previousCrop.includes("chilli")) {
    crop = "Paddy (MR220 CL2)";
    reason =
      "Rotating from chilli to paddy restores soil nitrogen. MR220 CL2 is a high-yield variety suited to Malaysian lowlands with good disease resistance.";
    days = 120;
    yieldKg = 600;
  } else {
    crop = "Tomato (MT1)";
    reason =
      "Tomato MT1 variety is well-adapted to Malaysian conditions with good disease tolerance. Current market prices are favourable for tomatoes.";
    days = 75;
    yieldKg = 350;
  }

  // Check market prices for trending crops
  const trendingUp = marketPrices.find(
    (m) => m.trend === "up" && m.trend_pct > 5 && m.item_name.toLowerCase().includes(crop.split(" ")[0].toLowerCase())
  );
  const marketNote = trendingUp
    ? `${trendingUp.item_name} prices up ${trendingUp.trend_pct}% this week`
    : null;

  const totalWeeks = Math.ceil(days / 7);
  const schedule: WeekSchedule[] = [];

  // Land prep (week 1)
  schedule.push({
    week: 1,
    phase: "Land preparation",
    tasks: [
      "Clear previous crop residue and weeds",
      "Test soil pH and amend if needed",
      "Apply base fertiliser and till soil",
    ],
  });

  // Planting (week 2)
  schedule.push({
    week: 2,
    phase: "Planting",
    tasks: [
      `Plant ${crop} seeds/seedlings at recommended spacing`,
      "Water thoroughly after planting",
      "Apply mulch to retain moisture",
    ],
  });

  // Early growth
  const earlyEnd = Math.min(Math.ceil(totalWeeks * 0.4), totalWeeks - 2);
  for (let w = 3; w <= earlyEnd; w++) {
    schedule.push({
      week: w,
      phase: "Early growth",
      tasks: [
        "Monitor for pest damage and diseases",
        "Water regularly — keep soil moist but not waterlogged",
        w === 3 ? "Apply foliar fertiliser" : "Check plant spacing and thin if needed",
      ],
    });
  }

  // Active growth
  const activeEnd = Math.min(Math.ceil(totalWeeks * 0.75), totalWeeks - 1);
  for (let w = earlyEnd + 1; w <= activeEnd; w++) {
    schedule.push({
      week: w,
      phase: "Active growth",
      tasks: [
        "Apply side-dressing fertiliser",
        "Scout for pests — check underside of leaves",
        "Ensure adequate irrigation during dry spells",
      ],
    });
  }

  // Pre-harvest / harvest
  for (let w = activeEnd + 1; w <= totalWeeks; w++) {
    schedule.push({
      week: w,
      phase: w === totalWeeks ? "Harvest" : "Maturation",
      tasks:
        w === totalWeeks
          ? [
              `Harvest ${crop} when ready — pick in early morning`,
              "Sort and grade produce for market",
              "Clean plot for next rotation",
            ]
          : [
              "Reduce watering slightly as crop matures",
              "Monitor for signs of readiness",
              "Prepare harvest equipment and storage",
            ],
    });
  }

  return {
    recommended_crop: crop,
    reason,
    planting_window: "Plant within the next 2 weeks — soil moisture is good",
    estimated_yield_kg: yieldKg,
    estimated_days_to_harvest: days,
    market_note: marketNote,
    weekly_schedule: schedule,
  };
}

export async function generatePlantingPlan(
  plot: PlotContext,
  farm: FarmContext,
  diseaseHistory: DiseaseEvent[],
  weather: WeatherContext | null,
  marketPrices: MarketItem[]
): Promise<PlantingPlan> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using mock planting plan");
    return getMockPlan(plot, diseaseHistory, marketPrices);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = buildPrompt(plot, farm, diseaseHistory, weather, marketPrices);

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim();

      const cleaned = text
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/\s*```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned);
      const validated = validate(parsed);
      if (validated) return validated;

      console.warn(`Planting plan validation failed (attempt ${attempt + 1})`);
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(`Planting plan Gemini call failed (attempt ${attempt + 1}):`, err);
    }
  }

  console.warn("Gemini planting plan failed, using mock");
  return getMockPlan(plot, diseaseHistory, marketPrices);
}
