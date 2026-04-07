import { GoogleGenerativeAI } from "@google/generative-ai";

interface PlotInput {
  label: string;
  crop_name: string;
  growth_stage: string;
  days_since_checked: number | null;
  recent_events: { event_type: string; disease_name: string | null; severity: string | null; created_at: string }[];
}

interface WeatherHistoryDay {
  condition: string;
  temp_celsius: number;
  humidity_pct: number;
  rainfall_mm: number;
}

export interface PlotRiskResult {
  label: string;
  risk_score: number;
  warning_level: string;
  warning_reason: string;
}

const VALID_WARNING_LEVELS = ["none", "yellow", "orange", "red"];

const SYSTEM_INSTRUCTION =
  "You are a Malaysian agricultural risk assessment expert. Analyse farm data and return ONLY valid JSON. No prose.";

function buildPrompt(
  plots: PlotInput[],
  weatherHistory: WeatherHistoryDay[]
): string {
  const weatherSummary = weatherHistory
    .map(
      (w, i) =>
        `Day ${i + 1}: ${w.condition}, ${w.temp_celsius}°C, humidity ${w.humidity_pct}%, rainfall ${w.rainfall_mm}mm`
    )
    .join("\n  ");

  const plotSummary = plots
    .map((p) => {
      const events =
        p.recent_events.length > 0
          ? p.recent_events
              .map(
                (e) =>
                  `${e.event_type}${e.disease_name ? ` (${e.disease_name}, ${e.severity})` : ""} on ${e.created_at.split("T")[0]}`
              )
              .join("; ")
          : "no recent events";
      return `- ${p.label}: ${p.crop_name} (${p.growth_stage}), last inspected ${p.days_since_checked ?? "never"} days ago, events: ${events}`;
    })
    .join("\n  ");

  return `Assess disease and stress risk for each plot on a Malaysian smallholder farm.

  Weather history (last 7 days):
  ${weatherSummary || "No weather data available"}

  Plots to assess:
  ${plotSummary}

  For each plot, return a risk score and warning level based on:
  - Consecutive rainy/thunderstorm days increase fungal disease risk
  - High humidity (>85%) + warm temp (>28°C) = elevated risk
  - Days since last clean inspection (>7 days = yellow, >14 days = orange)
  - Past disease events on this plot (recent disease = higher risk)
  - Growth stage vulnerability (mature crops more vulnerable than seedlings)
  - Drought stress (cracked soil + high temp = stress risk)

  Return JSON exactly:
  {
    "plots": [
      {
        "label": "string",
        "risk_score": number between 0.0 and 1.0,
        "warning_level": "none" | "yellow" | "orange" | "red",
        "warning_reason": "string (max 1 sentence, plain English, specific reason)"
      }
    ]
  }

  Rules:
  - risk_score 0.0-0.3 → none
  - risk_score 0.3-0.5 → yellow
  - risk_score 0.5-0.8 → orange
  - risk_score 0.8-1.0 → red (only if active confirmed disease in recent events)
  - warning_reason must be specific: mention the crop, the risk factor, not generic`;
}

function validate(
  data: unknown,
  expectedLabels: string[]
): PlotRiskResult[] | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;
  if (!Array.isArray(d.plots)) return null;
  if (d.plots.length !== expectedLabels.length) return null;

  const results: PlotRiskResult[] = [];
  const seenLabels = new Set<string>();

  for (const item of d.plots) {
    if (!item || typeof item !== "object") return null;
    const p = item as Record<string, unknown>;

    if (typeof p.label !== "string" || !expectedLabels.includes(p.label))
      return null;
    if (seenLabels.has(p.label)) return null;
    seenLabels.add(p.label);

    if (typeof p.risk_score !== "number" || p.risk_score < 0 || p.risk_score > 1)
      return null;
    if (
      typeof p.warning_level !== "string" ||
      !VALID_WARNING_LEVELS.includes(p.warning_level)
    )
      return null;
    if (typeof p.warning_reason !== "string") return null;

    results.push({
      label: p.label,
      risk_score: Math.round(p.risk_score * 100) / 100,
      warning_level: p.warning_level,
      warning_reason: (p.warning_reason as string).slice(0, 200),
    });
  }

  return results;
}

function getMockResults(
  plots: PlotInput[],
  weatherHistory: WeatherHistoryDay[]
): PlotRiskResult[] {
  const rainyDays = weatherHistory.filter(
    (w) => w.condition === "rainy" || w.condition === "thunderstorm"
  ).length;
  const avgHumidity =
    weatherHistory.length > 0
      ? weatherHistory.reduce((s, w) => s + w.humidity_pct, 0) /
        weatherHistory.length
      : 70;

  return plots.map((p) => {
    let score = 0.1;
    const reasons: string[] = [];

    // Weather-based risk
    if (rainyDays >= 3) {
      score += 0.2;
      reasons.push(`${rainyDays} rainy days this week`);
    }
    if (avgHumidity > 85) {
      score += 0.1;
      reasons.push("high humidity");
    }

    // Days since checked
    if (p.days_since_checked !== null && p.days_since_checked > 14) {
      score += 0.25;
      reasons.push(`not inspected in ${p.days_since_checked} days`);
    } else if (p.days_since_checked !== null && p.days_since_checked > 7) {
      score += 0.15;
      reasons.push(`${p.days_since_checked} days since last check`);
    }

    // Disease history
    const hasDiseaseEvent = p.recent_events.some(
      (e) => e.event_type === "inspection_disease"
    );
    if (hasDiseaseEvent) {
      score += 0.4;
      const diseaseEvent = p.recent_events.find(
        (e) => e.event_type === "inspection_disease"
      );
      reasons.push(
        `recent disease detected${diseaseEvent?.disease_name ? `: ${diseaseEvent.disease_name}` : ""}`
      );
    }

    // Growth stage vulnerability
    if (p.growth_stage === "mature" || p.growth_stage === "harvest_ready") {
      score += 0.05;
    }

    score = Math.min(1.0, score);

    let warningLevel: string;
    if (score >= 0.8 && hasDiseaseEvent) warningLevel = "red";
    else if (score >= 0.5) warningLevel = "orange";
    else if (score >= 0.3) warningLevel = "yellow";
    else warningLevel = "none";

    const reason =
      reasons.length > 0
        ? `${p.crop_name} in plot ${p.label}: ${reasons.join(", ")}.`
        : `${p.crop_name} in plot ${p.label} looks healthy.`;

    return {
      label: p.label,
      risk_score: Math.round(score * 100) / 100,
      warning_level: warningLevel,
      warning_reason: reason,
    };
  });
}

export async function assessRisk(
  plots: PlotInput[],
  weatherHistory: WeatherHistoryDay[]
): Promise<PlotRiskResult[]> {
  const expectedLabels = plots.map((p) => p.label);

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using mock risk data");
    return getMockResults(plots, weatherHistory);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const prompt = buildPrompt(plots, weatherHistory);

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
      const validated = validate(parsed, expectedLabels);
      if (validated) return validated;

      console.warn(`Risk scoring validation failed (attempt ${attempt + 1})`);
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(
        `Risk scoring Gemini call failed (attempt ${attempt + 1}):`,
        err
      );
    }
  }

  console.warn("Gemini risk scoring failed, using mock data");
  return getMockResults(plots, weatherHistory);
}
