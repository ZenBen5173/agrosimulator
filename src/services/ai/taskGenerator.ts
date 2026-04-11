/**
 * Task generation service — retrofitted to use Genkit.
 * Keeps the same exported interface so API routes don't change.
 */
import { dailyFarmOperationsFlow } from "@/flows/dailyFarmOperations";
import { shouldUseRealGemini, logGeminiCall } from "@/lib/gemini-budget";

interface PlotInput {
  label: string;
  crop_name: string;
  growth_stage: string;
  planted_date: string | null;
  expected_harvest: string | null;
  warning_level: string;
  days_since_checked: number | null;
}

interface WeatherInput {
  condition: string;
  temp_celsius: number;
  humidity_pct: number;
  rainfall_mm: number;
  wind_kmh: number;
  forecast?: { date: string; condition: string; rain_chance: number }[];
}

export interface GeneratedTask {
  title: string;
  description: string;
  task_type: string;
  priority: string;
  plot_label: string | null;
  triggered_by: string;
  resource_item?: string | null;
  resource_quantity?: number | null;
  resource_unit?: string | null;
  estimated_cost_rm?: number | null;
  timing_recommendation?: string | null;
}

// ─── Mock fallback (kept for when Genkit fails) ─────────────

function getMockTasks(
  plots: PlotInput[],
  weather: WeatherInput | null
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];

  if (weather) {
    if (weather.condition === "flood_risk" || weather.condition === "thunderstorm") {
      tasks.push({
        title: "Check field drainage",
        description: "Heavy rain expected — inspect drainage channels and clear any blockages.",
        task_type: "farm_wide",
        priority: "urgent",
        plot_label: null,
        triggered_by: "weather",
      });
    }
    if (weather.condition === "drought") {
      tasks.push({
        title: "Emergency watering needed",
        description: "High temperatures and low humidity — water all crops to prevent wilting.",
        task_type: "watering",
        priority: "urgent",
        plot_label: null,
        triggered_by: "weather",
      });
    }
  }

  for (const p of plots) {
    if (p.growth_stage === "harvest_ready" || p.growth_stage === "mature") {
      tasks.push({
        title: `Harvest ${p.crop_name}`,
        description: `Plot ${p.label} ${p.crop_name} is ready for harvest.`,
        task_type: "harvesting",
        priority: "urgent",
        plot_label: p.label,
        triggered_by: "growth_stage",
      });
    }
    if (p.growth_stage === "growing") {
      tasks.push({
        title: `Fertilize ${p.crop_name}`,
        description: `Apply balanced fertilizer to plot ${p.label}.`,
        task_type: "fertilizing",
        priority: "normal",
        plot_label: p.label,
        triggered_by: "schedule",
      });
    }
    if (p.days_since_checked !== null && p.days_since_checked >= 3 && p.growth_stage !== "harvested") {
      tasks.push({
        title: `Inspect ${p.crop_name} (${p.label})`,
        description: `Plot ${p.label} hasn't been checked in ${p.days_since_checked} days.`,
        task_type: "inspection",
        priority: p.days_since_checked >= 7 ? "urgent" : "normal",
        plot_label: p.label,
        triggered_by: "schedule",
      });
    }
  }

  const priorityOrder: Record<string, number> = { urgent: 0, normal: 1, low: 2 };
  tasks.sort((a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1));
  return tasks.slice(0, 7);
}

// ─── Public API (unchanged signature) ───────────────────────

export async function generateTasks(
  plots: PlotInput[],
  weather: WeatherInput | null,
  _soilType: string,
  _waterSource: string,
  farmId?: string
): Promise<GeneratedTask[]> {
  // Budget check — skip real Gemini if feature is disabled
  if (!shouldUseRealGemini("resources")) return getMockTasks(plots, weather);

  // If we have a farmId, use the Genkit flow (which autonomously gathers context)
  if (farmId) {
    logGeminiCall("resources");
    try {
      const result = await dailyFarmOperationsFlow({ farmId });
      return result.tasks.map((t) => ({
        title: t.title,
        description: t.description,
        task_type: t.task_type,
        priority: t.priority,
        plot_label: t.plot_label,
        triggered_by: t.triggered_by,
        resource_item: t.resource_item ?? null,
        resource_quantity: t.resource_quantity ?? null,
        resource_unit: t.resource_unit ?? null,
        estimated_cost_rm: t.estimated_cost_rm ?? null,
        timing_recommendation: t.timing_recommendation ?? null,
      }));
    } catch (err) {
      console.warn("Genkit dailyFarmOperations failed, using mock:", err);
    }
  }

  return getMockTasks(plots, weather);
}
