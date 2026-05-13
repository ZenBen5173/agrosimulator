/**
 * Historical & cross-farm priors for the doctor-style diagnosis pipeline.
 *
 * Two prior sources, both pure data lookups:
 *
 *   1. PLOT HISTORY — if THIS plot has had a confirmed diagnosis of disease
 *      X in the last 12 months, boost X's prior on the next diagnosis.
 *      Mirrors how a real plant doctor reasons: "you had anthracnose last
 *      season, and conditions haven't really changed, so this might be it
 *      again."
 *
 *   2. CROSS-FARM OUTBREAK — if 3+ farms in the same district + same crop
 *      have confirmed disease X in the last 14 days, boost X's prior on
 *      every farm in that district. This is the "community early warning"
 *      signal — the strongest accuracy lever in production once data
 *      density grows.
 *
 * Both functions return a `Record<diseaseId, boostMultiplier>` that the
 * orchestrator's `startDiagnosis` applies to the initial candidate priors.
 * Multipliers are conservative (1.5-2.5×) so a single past case doesn't
 * dominate the seed; the model + history questions still drive the bulk
 * of the diagnosis.
 *
 * Failures are non-fatal: a DB error returns an empty boost map and the
 * diagnosis runs with uniform seed priors. The pipeline never breaks
 * because of a missing index or transient connection.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

const PLOT_HISTORY_LOOKBACK_DAYS = 365;
const PLOT_HISTORY_BOOST_TREATMENT_WORKED = 2.5; // closed_at set + status='better'
const PLOT_HISTORY_BOOST_DEFAULT = 1.6;          // confirmed but no follow-up signal yet
const PLOT_HISTORY_BOOST_RECENT = 2.0;           // last 90 days, no follow-up signal
const PLOT_HISTORY_RECENT_DAYS = 90;
const PLOT_HISTORY_PENALTY_TREATMENT_FAILED = 0; // escalated_at set → DROP the boost (diagnosis was probably wrong)

const OUTBREAK_LOOKBACK_DAYS = 14;
const OUTBREAK_THRESHOLD = 3; // 3+ farms in district = community signal
const OUTBREAK_BOOST = 1.8;

export type PriorBoosts = Record<string, number>;

/**
 * Fetch boost multipliers for diseases that have been CONFIRMED on this
 * plot within the last 12 months — TREATMENT-OUTCOME-WEIGHTED.
 *
 * The big idea: a "confirmed Anthracnose" diagnosis where the treatment
 * worked is HIGH-CONFIDENCE evidence the diagnosis was correct, so we
 * boost it heavily for future diagnoses on this plot. A "confirmed
 * Anthracnose" where the farmer reported "worse" 5 days later is
 * negative evidence — the diagnosis was probably wrong, so we DROP the
 * boost entirely.
 *
 * Boost levels (max wins per disease, no compounding):
 *   - closed_at set + status='better' (treatment worked) → 2.5×
 *   - confirmed, recent (≤90 days), no follow-up signal yet → 2.0×
 *   - confirmed, no follow-up signal yet                    → 1.6×
 *   - escalated_at set on the follow-up (treatment failed)  → DROP (no boost)
 */
export async function getPlotHistoryBoosts(
  supabase: SupabaseClient,
  plotId: string | undefined
): Promise<PriorBoosts> {
  if (!plotId) return {};
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - PLOT_HISTORY_LOOKBACK_DAYS);
    const recentCutoff = new Date();
    recentCutoff.setDate(recentCutoff.getDate() - PLOT_HISTORY_RECENT_DAYS);

    // Pull confirmed sessions + their follow-up signals (closed_at on
    // session, escalated_at on follow-up). Left-join via the follow-up
    // table so sessions with no follow-up still appear.
    interface PlotHistoryRow {
      id: string;
      diagnosis_id: string | null;
      finalised_at: string | null;
      outcome: string | null;
      closed_at: string | null;
      doctor_treatment_followup:
        | Array<{ escalated_at: string | null; status: string | null }>
        | null;
    }
    const { data, error } = await supabase
      .from("doctor_diagnosis_sessions")
      .select(
        "id, diagnosis_id, finalised_at, outcome, closed_at, " +
          "doctor_treatment_followup(escalated_at, status)"
      )
      .eq("plot_id", plotId)
      .eq("outcome", "confirmed")
      .gte("finalised_at", cutoff.toISOString())
      .not("diagnosis_id", "is", null);

    if (error || !data) return {};

    const rows = data as unknown as PlotHistoryRow[];
    const boosts: PriorBoosts = {};
    for (const row of rows) {
      const id = row.diagnosis_id;
      if (!id) continue;
      const finalisedAt = row.finalised_at ? new Date(row.finalised_at) : null;
      const isRecent = !!finalisedAt && finalisedAt >= recentCutoff;
      const followups = row.doctor_treatment_followup ?? [];
      const treatmentFailed = followups.some((f) => f.escalated_at !== null);
      const treatmentWorked =
        row.closed_at !== null &&
        followups.some((f) => f.status === "better");

      let boost: number;
      if (treatmentFailed) {
        boost = PLOT_HISTORY_PENALTY_TREATMENT_FAILED; // 0 → effectively no boost
      } else if (treatmentWorked) {
        boost = PLOT_HISTORY_BOOST_TREATMENT_WORKED;
      } else {
        boost = isRecent ? PLOT_HISTORY_BOOST_RECENT : PLOT_HISTORY_BOOST_DEFAULT;
      }

      if (boost > 0) {
        // Take MAX (no compounding) so 5 confirmed cases don't go to 32×.
        boosts[id] = Math.max(boosts[id] ?? 1, boost);
      }
    }
    return boosts;
  } catch {
    return {};
  }
}

/**
 * Fetch boost multipliers for diseases that 3+ other farms in the same
 * district have CONFIRMED on the same crop in the last 14 days. This is
 * the community-outbreak signal: when a wave of anthracnose sweeps
 * Cameron Highlands chilli farms, every NEW farmer's diagnosis should
 * give anthracnose a head start.
 *
 * Privacy: we never expose which farms reported, only the boost for the
 * diagnosis. RLS enforces that the calling user can only see their own
 * sessions; this function uses the service-role client (passed in by the
 * caller) to count across all farms in a district.
 */
export async function getCrossFarmOutbreakBoosts(
  supabase: SupabaseClient,
  args: { district: string; crop: string; excludeFarmId?: string }
): Promise<PriorBoosts> {
  if (!args.district || !args.crop) return {};
  try {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - OUTBREAK_LOOKBACK_DAYS);

    // Join through farms to filter by district. We select only what we need.
    // The query: confirmed diagnoses, this crop, in this district, in the
    // last 14 days, grouped by diagnosis_id.
    const { data, error } = await supabase
      .from("doctor_diagnosis_sessions")
      .select("diagnosis_id, farm_id, farms!inner(district)")
      .eq("outcome", "confirmed")
      .eq("crop", args.crop)
      .eq("farms.district", args.district)
      .gte("finalised_at", cutoff.toISOString())
      .not("diagnosis_id", "is", null);

    if (error || !data) return {};

    // Count UNIQUE farms per diagnosis_id (one farm reporting twice
    // doesn't double-count toward the outbreak threshold).
    const farmsByDiagnosis: Record<string, Set<string>> = {};
    for (const row of data) {
      const id = row.diagnosis_id as string | null;
      const farmId = row.farm_id as string | null;
      if (!id || !farmId) continue;
      if (args.excludeFarmId && farmId === args.excludeFarmId) continue;
      if (!farmsByDiagnosis[id]) farmsByDiagnosis[id] = new Set();
      farmsByDiagnosis[id].add(farmId);
    }

    const boosts: PriorBoosts = {};
    for (const [diagnosisId, farms] of Object.entries(farmsByDiagnosis)) {
      if (farms.size >= OUTBREAK_THRESHOLD) {
        boosts[diagnosisId] = OUTBREAK_BOOST;
      }
    }
    return boosts;
  } catch {
    return {};
  }
}

/**
 * Combine multiple boost sources by taking the MAX per disease. (Not
 * multiplicative — a disease that's both recurring AND in an outbreak
 * shouldn't get 4× boost, that swamps everything else.)
 */
export function mergePriorBoosts(...sources: PriorBoosts[]): PriorBoosts {
  const merged: PriorBoosts = {};
  for (const src of sources) {
    for (const [id, boost] of Object.entries(src)) {
      merged[id] = Math.max(merged[id] ?? 1, boost);
    }
  }
  return merged;
}
