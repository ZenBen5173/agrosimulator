import { GoogleGenerativeAI } from "@google/generative-ai";

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
}

const VALID_TASK_TYPES = [
  "inspection",
  "watering",
  "fertilizing",
  "treatment",
  "harvesting",
  "replanting",
  "farm_wide",
];
const VALID_PRIORITIES = ["urgent", "normal", "low"];
const VALID_TRIGGERS = [
  "weather",
  "inspection_result",
  "growth_stage",
  "schedule",
];

const SYSTEM_INSTRUCTION = `You are a Malaysian agricultural task advisor. Based on the farm state, weather conditions, and crop growth stages, generate a prioritised daily task list for a smallholder farmer. Return ONLY valid JSON — no prose, no markdown, no explanation outside the JSON.`;

function buildPrompt(
  plots: PlotInput[],
  weather: WeatherInput | null,
  soilType: string,
  waterSource: string,
  todayStr: string
): string {
  const plotSummary = plots
    .map(
      (p) =>
        `- ${p.label}: ${p.crop_name} (${p.growth_stage}), planted ${p.planted_date || "unknown"}, harvest ${p.expected_harvest || "unknown"}, warning: ${p.warning_level}, last checked: ${p.days_since_checked ?? "never"} days ago`
    )
    .join("\n");

  const weatherSummary = weather
    ? `Current weather: ${weather.condition}, ${weather.temp_celsius}°C, humidity ${weather.humidity_pct}%, rainfall ${weather.rainfall_mm}mm, wind ${weather.wind_kmh}km/h
Forecast: ${(weather.forecast || []).map((f) => `${f.date}: ${f.condition} (${f.rain_chance}% rain)`).join(", ")}`
    : "Weather: unknown";

  return `Today is ${todayStr}. Generate daily tasks for this Malaysian farm:

Soil: ${soilType}, Water: ${waterSource}

Plots:
${plotSummary}

${weatherSummary}

Rules:
- Generate 3-7 tasks, prioritised by urgency
- Include weather-triggered tasks (e.g. "Drain fields" if flood_risk, "Extra watering" if drought)
- Include growth-stage tasks (e.g. "Harvest ready" if mature/harvest_ready, "Apply fertilizer" if growing)
- Include inspection tasks for plots not checked in 3+ days
- Include watering tasks based on weather + water source
- If thunderstorm/flood_risk: add urgent "Secure equipment" or "Check drainage" task
- If drought: add urgent watering task
- Each task targets a specific plot (plot_label) or is farm-wide (plot_label: null)
- Keep titles short (max 8 words), descriptions 1 sentence

Return JSON array:
[
  {
    "title": "string",
    "description": "string (1 sentence max)",
    "task_type": "inspection | watering | fertilizing | treatment | harvesting | replanting | farm_wide",
    "priority": "urgent | normal | low",
    "plot_label": "A1" or null,
    "triggered_by": "weather | growth_stage | schedule | inspection_result"
  }
]`;
}

function validate(data: unknown, validLabels: string[]): GeneratedTask[] | null {
  if (!Array.isArray(data)) return null;
  if (data.length === 0 || data.length > 10) return null;

  const tasks: GeneratedTask[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") return null;
    const t = item as Record<string, unknown>;

    if (typeof t.title !== "string" || !t.title) return null;
    if (typeof t.description !== "string") return null;
    if (typeof t.task_type !== "string" || !VALID_TASK_TYPES.includes(t.task_type))
      return null;
    if (typeof t.priority !== "string" || !VALID_PRIORITIES.includes(t.priority))
      return null;
    if (
      typeof t.triggered_by !== "string" ||
      !VALID_TRIGGERS.includes(t.triggered_by)
    )
      return null;

    const plotLabel =
      t.plot_label === null || t.plot_label === undefined
        ? null
        : typeof t.plot_label === "string"
          ? t.plot_label
          : null;

    // Validate plot_label references a real plot (or is null for farm-wide)
    if (plotLabel !== null && !validLabels.includes(plotLabel)) {
      return null;
    }

    tasks.push({
      title: t.title.slice(0, 80),
      description: (t.description as string).slice(0, 200),
      task_type: t.task_type,
      priority: t.priority,
      plot_label: plotLabel,
      triggered_by: t.triggered_by,
    });
  }

  return tasks;
}

function getMockTasks(
  plots: PlotInput[],
  weather: WeatherInput | null
): GeneratedTask[] {
  const tasks: GeneratedTask[] = [];

  // Weather-based tasks
  if (weather) {
    if (weather.condition === "flood_risk" || weather.condition === "thunderstorm") {
      tasks.push({
        title: "Check field drainage",
        description:
          "Heavy rain expected — inspect drainage channels and clear any blockages.",
        task_type: "farm_wide",
        priority: "urgent",
        plot_label: null,
        triggered_by: "weather",
      });
    }
    if (weather.condition === "drought") {
      tasks.push({
        title: "Emergency watering needed",
        description:
          "High temperatures and low humidity — water all crops to prevent wilting.",
        task_type: "watering",
        priority: "urgent",
        plot_label: null,
        triggered_by: "weather",
      });
    }
    if (
      weather.condition === "sunny" &&
      weather.temp_celsius > 32
    ) {
      tasks.push({
        title: "Water crops in the evening",
        description:
          "Hot weather today — water crops after 5 PM to reduce evaporation loss.",
        task_type: "watering",
        priority: "normal",
        plot_label: null,
        triggered_by: "weather",
      });
    }
  }

  // Growth-stage tasks
  for (const p of plots) {
    if (p.growth_stage === "harvest_ready" || p.growth_stage === "mature") {
      tasks.push({
        title: `Harvest ${p.crop_name}`,
        description: `Plot ${p.label} ${p.crop_name} is ready for harvest — pick before quality degrades.`,
        task_type: "harvesting",
        priority: "urgent",
        plot_label: p.label,
        triggered_by: "growth_stage",
      });
    }
    if (p.growth_stage === "seedling") {
      tasks.push({
        title: `Check ${p.crop_name} seedlings`,
        description: `Inspect plot ${p.label} seedlings for healthy growth and pest damage.`,
        task_type: "inspection",
        priority: "normal",
        plot_label: p.label,
        triggered_by: "growth_stage",
      });
    }
    if (p.growth_stage === "growing") {
      tasks.push({
        title: `Fertilize ${p.crop_name}`,
        description: `Apply balanced fertilizer to plot ${p.label} to support active growth.`,
        task_type: "fertilizing",
        priority: "normal",
        plot_label: p.label,
        triggered_by: "schedule",
      });
    }
    if (p.growth_stage === "harvested") {
      tasks.push({
        title: `Plan replanting for ${p.label}`,
        description: `Plot ${p.label} is cleared — consider replanting for the next season.`,
        task_type: "replanting",
        priority: "low",
        plot_label: p.label,
        triggered_by: "growth_stage",
      });
    }
  }

  // Inspection tasks for unchecked plots
  for (const p of plots) {
    if (
      p.days_since_checked !== null &&
      p.days_since_checked >= 3 &&
      p.growth_stage !== "harvested"
    ) {
      tasks.push({
        title: `Inspect ${p.crop_name} (${p.label})`,
        description: `Plot ${p.label} hasn't been checked in ${p.days_since_checked} days — walk through and look for issues.`,
        task_type: "inspection",
        priority: p.days_since_checked >= 7 ? "urgent" : "normal",
        plot_label: p.label,
        triggered_by: "schedule",
      });
    }
  }

  // Cap at 7 tasks, sorted by priority
  const priorityOrder: Record<string, number> = {
    urgent: 0,
    normal: 1,
    low: 2,
  };
  tasks.sort(
    (a, b) => (priorityOrder[a.priority] ?? 1) - (priorityOrder[b.priority] ?? 1)
  );

  return tasks.slice(0, 7);
}

export async function generateTasks(
  plots: PlotInput[],
  weather: WeatherInput | null,
  soilType: string,
  waterSource: string
): Promise<GeneratedTask[]> {
  const todayStr = new Date().toISOString().split("T")[0];
  const validLabels = plots.map((p) => p.label);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using mock tasks");
    return getMockTasks(plots, weather);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = buildPrompt(plots, weather, soilType, waterSource, todayStr);

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
      const validated = validate(parsed, validLabels);
      if (validated) return validated;

      console.warn(`Task generation validation failed (attempt ${attempt + 1})`);
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(
        `Task generation Gemini call failed (attempt ${attempt + 1}):`,
        err
      );
    }
  }

  console.warn("Gemini task generation failed, using mock tasks");
  return getMockTasks(plots, weather);
}
