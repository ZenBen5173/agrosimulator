/**
 * Risk scoring service — retrofitted to use Genkit.
 * Keeps the same exported interface so API routes don't change.
 */
import { riskAssessmentFlow } from "@/flows/riskAssessment";

interface PlotInput {
  label: string;
  crop_name: string;
  growth_stage: string;
  days_since_checked: number | null;
  recent_events: {
    event_type: string;
    disease_name: string | null;
    severity: string | null;
    created_at: string;
  }[];
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

// ─── Mock fallback ──────────────────────────────────────────

function getMockResults(
  plots: PlotInput[],
  weatherHistory: WeatherHistoryDay[]
): PlotRiskResult[] {
  const rainyDays = weatherHistory.filter(
    (w) => w.condition === "rainy" || w.condition === "thunderstorm"
  ).length;
  const avgHumidity =
    weatherHistory.length > 0
      ? weatherHistory.reduce((s, w) => s + w.humidity_pct, 0) / weatherHistory.length
      : 70;

  return plots.map((p) => {
    let score = 0.1;
    const reasons: string[] = [];

    if (rainyDays >= 3) { score += 0.2; reasons.push(`${rainyDays} rainy days this week`); }
    if (avgHumidity > 85) { score += 0.1; reasons.push("high humidity"); }
    if (p.days_since_checked !== null && p.days_since_checked > 14) { score += 0.25; reasons.push(`not inspected in ${p.days_since_checked} days`); }
    else if (p.days_since_checked !== null && p.days_since_checked > 7) { score += 0.15; reasons.push(`${p.days_since_checked} days since last check`); }

    const hasDiseaseEvent = p.recent_events.some((e) => e.event_type === "inspection_disease");
    if (hasDiseaseEvent) { score += 0.4; reasons.push("recent disease detected"); }
    if (p.growth_stage === "mature" || p.growth_stage === "harvest_ready") score += 0.05;

    score = Math.min(1.0, score);

    let warningLevel: string;
    if (score >= 0.8 && hasDiseaseEvent) warningLevel = "red";
    else if (score >= 0.5) warningLevel = "orange";
    else if (score >= 0.3) warningLevel = "yellow";
    else warningLevel = "none";

    return {
      label: p.label,
      risk_score: Math.round(score * 100) / 100,
      warning_level: warningLevel,
      warning_reason: reasons.length > 0
        ? `${p.crop_name} in plot ${p.label}: ${reasons.join(", ")}.`
        : `${p.crop_name} in plot ${p.label} looks healthy.`,
    };
  });
}

// ─── Public API (unchanged signature) ───────────────────────

export async function assessRisk(
  plots: PlotInput[],
  weatherHistory: WeatherHistoryDay[],
  farmId?: string
): Promise<PlotRiskResult[]> {
  // Use Genkit flow if farmId available
  if (farmId) {
    try {
      const result = await riskAssessmentFlow({ farmId });
      return result.plots.map((p) => ({
        label: p.label,
        risk_score: Math.round(p.risk_score * 100) / 100,
        warning_level: p.warning_level,
        warning_reason: p.warning_reason,
      }));
    } catch (err) {
      console.warn("Genkit riskAssessment failed, using mock:", err);
    }
  }

  return getMockResults(plots, weatherHistory);
}
