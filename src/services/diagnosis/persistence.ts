/**
 * Persistence layer for the doctor-style diagnosis pipeline.
 *
 * Saves the finalised session into Supabase and schedules the 5-day
 * treatment follow-up. The pg_cron job `doctor-treatment-followup-daily`
 * (created in migration v2_0_treatment_followup_cron) picks up due
 * follow-ups every morning and creates a task for the farmer.
 *
 * Phase 3 (2.1): also auto-posts a Crop Health Costs journal entry to
 * the Books when the diagnosis is confirmed AND the AI estimated a
 * chemical cost. The posting is best-effort — failures are logged but
 * never block the diagnosis save.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DiagnosisResult, DiagnosisSession } from "@/lib/diagnosis/types";
import { postDiagnosisTreatment } from "@/services/books/postings";

const FOLLOWUP_DELAY_DAYS = 5;

export async function persistDiagnosis(
  supabase: SupabaseClient,
  args: {
    session: DiagnosisSession;
    result: DiagnosisResult;
    farmId: string;
    userId: string;
  }
): Promise<{ sessionRowId: string; followupRowId: string | null }> {
  const { session, result, farmId, userId } = args;

  const { data: row, error } = await supabase
    .from("doctor_diagnosis_sessions")
    .insert({
      farm_id: farmId,
      plot_id: session.plotId ?? null,
      user_id: userId,
      crop: session.crop,
      pattern: session.pattern ?? null,
      photo_quality: null, // populated by analysePhoto when we extend persistence to mid-flow
      observations: [],
      candidates: session.candidates,
      history_answers: session.historyAnswers,
      physical_test: session.physicalTest ?? null,
      result,
      outcome: result.outcome,
      confidence: result.confidence,
      diagnosis_id: result.diagnosis?.diseaseId ?? null,
      diagnosis_name: result.diagnosis?.name ?? null,
      finalised_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error || !row) {
    throw new Error(`Failed to persist diagnosis session: ${error?.message ?? "unknown"}`);
  }

  // Schedule a 5-day follow-up only if we have an actionable diagnosis with treatment
  let followupRowId: string | null = null;
  if (result.outcome !== "cannot_determine" && result.prescription) {
    const due = new Date();
    due.setDate(due.getDate() + FOLLOWUP_DELAY_DAYS);
    const dueDate = due.toISOString().split("T")[0];

    const { data: fRow, error: fErr } = await supabase
      .from("doctor_treatment_followup")
      .insert({
        session_id: row.id,
        farm_id: farmId,
        user_id: userId,
        scheduled_for: dueDate,
      })
      .select("id")
      .single();

    if (fErr) {
      // Non-fatal — we still saved the diagnosis
      console.warn("Failed to schedule follow-up:", fErr.message);
    } else if (fRow) {
      followupRowId = fRow.id;
    }
  }

  // Auto-post the Crop Health Costs journal entry. Best-effort — never
  // blocks the diagnosis save. Only posts when we have:
  //   - a confirmed (or uncertain-but-actionable) outcome
  //   - a chemical with an estimated cost
  if (
    result.outcome === "confirmed" &&
    result.prescription?.controlNow.chemical?.estCostRm
  ) {
    const chem = result.prescription.controlNow.chemical;
    try {
      await postDiagnosisTreatment(supabase, {
        farmId,
        createdBy: userId,
        diagnosisSessionId: row.id,
        diagnosisName: result.diagnosis?.name,
        items: [
          {
            itemName: chem.name,
            itemType: "pesticide", // safe default for chemical control
            qtyUsed: 1, // unit assumed; the cost IS the value
            unit: "treatment",
            unitCostRm: chem.estCostRm ?? 0,
          },
        ],
      });
    } catch (err) {
      console.warn(
        "Failed to auto-post diagnosis treatment to Books:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return { sessionRowId: row.id, followupRowId };
}

/**
 * Apply a Better/Same/Worse follow-up answer.
 *  - better → close session, mark plot warning cleared
 *  - same → schedule a 3-day recheck
 *  - worse → escalate to MARDI/DOA, set plot warning red
 */
export async function applyFollowupResult(
  supabase: SupabaseClient,
  args: {
    followupId: string;
    status: "better" | "same" | "worse";
    notes?: string;
  }
): Promise<{
  closedSession: boolean;
  scheduledRecheckId: string | null;
  escalated: boolean;
}> {
  const { followupId, status, notes } = args;

  // Mark this follow-up complete
  const { data: followup, error: fErr } = await supabase
    .from("doctor_treatment_followup")
    .update({
      completed_at: new Date().toISOString(),
      status,
      notes: notes ?? null,
    })
    .eq("id", followupId)
    .select("session_id, farm_id, user_id")
    .single();

  if (fErr || !followup) {
    throw new Error(`Failed to update follow-up: ${fErr?.message ?? "not found"}`);
  }

  if (status === "better") {
    await supabase
      .from("doctor_diagnosis_sessions")
      .update({ closed_at: new Date().toISOString() })
      .eq("id", followup.session_id);
    return { closedSession: true, scheduledRecheckId: null, escalated: false };
  }

  if (status === "same") {
    // Schedule a 3-day recheck
    const recheck = new Date();
    recheck.setDate(recheck.getDate() + 3);
    const { data: row } = await supabase
      .from("doctor_treatment_followup")
      .insert({
        session_id: followup.session_id,
        farm_id: followup.farm_id,
        user_id: followup.user_id,
        scheduled_for: recheck.toISOString().split("T")[0],
      })
      .select("id")
      .single();
    return { closedSession: false, scheduledRecheckId: row?.id ?? null, escalated: false };
  }

  // worse → escalate
  await supabase
    .from("doctor_treatment_followup")
    .update({
      escalated_to: "mardi_officer",
      escalated_at: new Date().toISOString(),
    })
    .eq("id", followupId);

  return { closedSession: false, scheduledRecheckId: null, escalated: true };
}
