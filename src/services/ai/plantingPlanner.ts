/**
 * Planting planner service — retrofitted to use Genkit.
 * Keeps the same exported interface so API routes don't change.
 */
import { plantingRecommendationFlow } from "@/flows/plantingRecommendation";

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

// ─── Mock fallback ──────────────────────────────────────────

function getMockPlan(
  plot: PlotContext,
  diseaseHistory: DiseaseEvent[]
): PlantingPlan {
  const hadDisease = diseaseHistory.some(
    (e) => e.event_type === "inspection_disease" || e.event_type === "inspection_suspicious"
  );

  const previousCrop = plot.crop_name.toLowerCase();
  let crop: string, reason: string, days: number, yieldKg: number;

  if (hadDisease && previousCrop.includes("paddy")) {
    crop = "Chilli (Cili Padi)"; reason = "After paddy disease, rotating to chilli breaks the disease cycle."; days = 90; yieldKg = 180;
  } else if (hadDisease) {
    crop = "Kangkung (Water Spinach)"; reason = "Fast-growing kangkung helps break disease cycles."; days = 30; yieldKg = 250;
  } else if (previousCrop.includes("chilli")) {
    crop = "Paddy (MR220 CL2)"; reason = "Rotating from chilli to paddy restores soil nitrogen."; days = 120; yieldKg = 600;
  } else {
    crop = "Tomato (MT1)"; reason = "Tomato MT1 is well-adapted to Malaysian conditions."; days = 75; yieldKg = 350;
  }

  const totalWeeks = Math.ceil(days / 7);
  const schedule: WeekSchedule[] = [
    { week: 1, phase: "Land preparation", tasks: ["Clear residue", "Test soil pH", "Apply base fertiliser"] },
    { week: 2, phase: "Planting", tasks: [`Plant ${crop}`, "Water thoroughly", "Apply mulch"] },
  ];
  for (let w = 3; w <= Math.ceil(totalWeeks * 0.4); w++) {
    schedule.push({ week: w, phase: "Early growth", tasks: ["Monitor pests", "Water regularly", "Apply foliar fertiliser"] });
  }
  for (let w = Math.ceil(totalWeeks * 0.4) + 1; w <= totalWeeks - 1; w++) {
    schedule.push({ week: w, phase: "Active growth", tasks: ["Side-dress fertiliser", "Scout for pests", "Ensure irrigation"] });
  }
  schedule.push({ week: totalWeeks, phase: "Harvest", tasks: ["Harvest in early morning", "Sort and grade", "Clean plot"] });

  return { recommended_crop: crop, reason, planting_window: "Plant within 2 weeks", estimated_yield_kg: yieldKg, estimated_days_to_harvest: days, market_note: null, weekly_schedule: schedule };
}

// ─── Public API (unchanged signature) ───────────────────────

export async function generatePlantingPlan(
  plot: PlotContext,
  farm: FarmContext,
  diseaseHistory: DiseaseEvent[],
  _weather: WeatherContext | null,
  _marketPrices: MarketItem[],
  farmId?: string,
  plotId?: string
): Promise<PlantingPlan> {
  if (farmId && plotId) {
    try {
      return await plantingRecommendationFlow({
        farmId,
        plotId,
        plotLabel: plot.label,
        currentCrop: plot.crop_name,
      });
    } catch (err) {
      console.warn("Genkit plantingRecommendation failed, using mock:", err);
    }
  }

  return getMockPlan(plot, diseaseHistory);
}
