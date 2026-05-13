/**
 * AgroSim 2.0 — Doctor-style diagnosis API.
 *
 * Stateless single endpoint that accepts a `step` field and the current
 * session object, returns the updated session + the next prompt for the UI.
 *
 * Steps:
 *   - "start"     → returns new session with seeded candidates
 *   - "pattern"   → applies pattern answer, returns updated session
 *   - "photo"     → calls vision flow, returns updated session + observations
 *   - "history"   → applies history Q&A, returns next history question or null
 *   - "test"      → applies physical test result, returns updated session
 *   - "finalise"  → returns DiagnosisResult
 *
 * Persistence is left to the caller (UI client or a later wrapping route).
 * This keeps the orchestrator pure and easy to test.
 */

import { NextResponse } from "next/server";
import {
  startDiagnosis,
  applyPattern,
  analysePhoto,
  applyHistoryAnswer,
  getHistoryQuestions,
  getPhysicalTest,
  applyPhysicalTestResult,
  finalise,
  getLayerTwoPlan,
  applyExtraPhoto,
  finaliseDuoLayer,
  applyReferenceVerdict,
} from "@/services/diagnosis/orchestrator";
import { persistDiagnosis } from "@/services/diagnosis/persistence";
import {
  getPlotHistoryBoosts,
  getCrossFarmOutbreakBoosts,
  mergePriorBoosts,
} from "@/services/diagnosis/historicalPriors";
import { createClient } from "@/lib/supabase/server";
import type {
  CropName,
  DiagnosisSession,
  ExtraPhotoKind,
  SpreadPattern,
} from "@/lib/diagnosis/types";

const VALID_CROPS: CropName[] = [
  "paddy",
  "chilli",
  "kangkung",
  "banana",
  "corn",
  "sweet_potato",
];

const VALID_PATTERNS: SpreadPattern[] = [
  "one_plant",
  "few_plants",
  "whole_plot",
  "multiple_crops",
];

interface RequestBody {
  step:
    | "start"
    | "pattern"
    | "photo"
    | "history"
    | "test"
    | "finalise"
    // Layer 2 / duo-layer steps:
    | "layer_two_plan"   // returns Layer 1 result + ExtraPhotoRequest[]
    | "extra_photo"      // upload one targeted close-up
    | "finalise_duo"     // produce Layer 2 final result
    | "reference_verdict"; // farmer says yes/no on textbook comparison
  session?: DiagnosisSession;
  // step-specific payloads
  crop?: CropName;
  plotId?: string;
  plotLabel?: string;
  recentWeather?: {
    rainyDaysLast7?: number;
    avgHumidityLast7?: number;
    consecutiveHotDays?: number;
  };
  pattern?: SpreadPattern;
  photoBase64?: string;
  photoMimeType?: string;
  questionId?: string;
  question?: string;
  answer?: string;
  testResult?: string;
  // Layer 2 specific:
  extraPhotoKind?: ExtraPhotoKind;
  // Reference verdict specific:
  referenceDiseaseId?: string;
  referenceMatches?: boolean;
  // Persistence — opt-in. Requires authenticated session + farmId.
  persist?: boolean;
  farmId?: string;
}

function badRequest(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export async function POST(request: Request) {
  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return badRequest("Invalid JSON body");
  }

  try {
    switch (body.step) {
      case "start": {
        if (!body.crop || !VALID_CROPS.includes(body.crop)) {
          return badRequest("`crop` is required and must be a known CropName");
        }

        // Best-effort: fetch plot-history + cross-farm priors. Both are
        // non-blocking — if Supabase fails or the user isn't logged in,
        // we proceed with uniform priors. The diagnosis still works; it
        // just won't get the historical head-start.
        let priorBoosts: Record<string, number> | undefined;
        try {
          const supabase = await createClient();
          const plotHistory = await getPlotHistoryBoosts(supabase, body.plotId);
          let crossFarm: Record<string, number> = {};
          if (body.farmId) {
            // Look up the farm's district to scope the outbreak query
            const { data: farm } = await supabase
              .from("farms")
              .select("district")
              .eq("id", body.farmId)
              .maybeSingle();
            if (farm?.district) {
              crossFarm = await getCrossFarmOutbreakBoosts(supabase, {
                district: farm.district,
                crop: body.crop,
                excludeFarmId: body.farmId,
              });
            }
          }
          const merged = mergePriorBoosts(plotHistory, crossFarm);
          if (Object.keys(merged).length > 0) priorBoosts = merged;
        } catch (err) {
          console.warn("Prior-boost lookup skipped:", err);
        }

        const session = startDiagnosis({
          crop: body.crop,
          plotId: body.plotId,
          plotLabel: body.plotLabel,
          recentWeather: body.recentWeather,
          priorBoosts,
        });
        return NextResponse.json({
          session,
          priorBoostsApplied: priorBoosts ?? null,
        });
      }

      case "pattern": {
        if (!body.session) return badRequest("`session` required");
        if (!body.pattern || !VALID_PATTERNS.includes(body.pattern)) {
          return badRequest("`pattern` is required and must be a known SpreadPattern");
        }
        const session = applyPattern(body.session, body.pattern);
        return NextResponse.json({ session });
      }

      case "photo": {
        if (!body.session) return badRequest("`session` required");
        if (!body.photoBase64 || !body.photoMimeType) {
          return badRequest("`photoBase64` and `photoMimeType` required");
        }
        const result = await analysePhoto(
          body.session,
          body.photoBase64,
          body.photoMimeType
        );
        // cropMismatch is now a soft warning surfaced in the response —
        // the UI shows it prominently but offers an override. We always
        // return the next history questions so the override is just a
        // UI decision, no extra round-trip needed.
        return NextResponse.json({
          session: result.session,
          observations: result.observations,
          photoQuality: result.photoQuality,
          cropMismatch: result.cropMismatch,
          nextHistoryQuestions: getHistoryQuestions(result.session, 3),
        });
      }

      case "history": {
        if (!body.session) return badRequest("`session` required");
        if (!body.questionId || !body.question || body.answer === undefined) {
          return badRequest("`questionId`, `question`, and `answer` required");
        }
        const session = applyHistoryAnswer(
          body.session,
          body.questionId,
          body.question,
          body.answer
        );
        // Determine if more history questions are useful — heuristic: stop
        // when we have 3 answers OR when only 1 candidate remains in play.
        const inPlayCount = session.candidates.filter((c) => !c.ruledOut).length;
        const moreHistory =
          session.historyAnswers.length < 3 && inPlayCount > 1
            ? getHistoryQuestions(session, 3).filter(
                (q) =>
                  !session.historyAnswers.some((a) => a.questionId === q.id)
              )
            : [];
        return NextResponse.json({
          session,
          nextHistoryQuestions: moreHistory,
          physicalTest:
            moreHistory.length === 0 ? getPhysicalTest(session) : null,
        });
      }

      case "test": {
        if (!body.session) return badRequest("`session` required");
        if (!body.testResult) return badRequest("`testResult` required");
        const session = applyPhysicalTestResult(body.session, body.testResult);
        const result = finalise(session);
        const persisted = await maybePersist(body, session, result);
        return NextResponse.json({
          session,
          result,
          persisted,
        });
      }

      case "finalise": {
        if (!body.session) return badRequest("`session` required");
        const result = finalise(body.session);
        const persisted = await maybePersist(body, body.session, result);
        return NextResponse.json({
          result,
          persisted,
        });
      }

      // ─── Layer 2 (duo-layer) ──────────────────────────────────
      case "layer_two_plan": {
        if (!body.session) return badRequest("`session` required");
        const plan = getLayerTwoPlan(body.session);
        return NextResponse.json({
          layerOneResult: plan.layerOneResult,
          requests: plan.requests,
        });
      }

      case "extra_photo": {
        if (!body.session) return badRequest("`session` required");
        if (!body.photoBase64 || !body.photoMimeType) {
          return badRequest("`photoBase64` and `photoMimeType` required");
        }
        // extraPhotoKind is now optional — when undefined we treat the
        // photo as a generic close-up. The vision flow handles both.
        const result = await applyExtraPhoto(
          body.session,
          body.extraPhotoKind,
          body.photoBase64,
          body.photoMimeType
        );
        return NextResponse.json({
          session: result.session,
          observations: result.observations,
        });
      }

      case "finalise_duo": {
        if (!body.session) return badRequest("`session` required");
        const result = await finaliseDuoLayer(body.session);
        const persisted = await maybePersist(body, body.session, result);
        return NextResponse.json({
          result,
          persisted,
        });
      }

      case "reference_verdict": {
        if (!body.session) return badRequest("`session` required");
        if (!body.referenceDiseaseId) return badRequest("`referenceDiseaseId` required");
        if (typeof body.referenceMatches !== "boolean") {
          return badRequest("`referenceMatches` must be boolean");
        }
        const out = applyReferenceVerdict(body.session, {
          diseaseId: body.referenceDiseaseId,
          matches: body.referenceMatches,
        });
        const persisted = await maybePersist(body, out.session, out.result);
        return NextResponse.json({
          session: out.session,
          result: out.result,
          persisted,
        });
      }

      default:
        return badRequest(`Unknown step: ${body.step}`);
    }
  } catch (err) {
    console.error("Diagnosis v2 error:", err);
    return NextResponse.json(
      {
        error: "Diagnosis pipeline error",
        message: err instanceof Error ? err.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

/**
 * If the request asked for persistence and we have an authenticated user +
 * farmId, save the session and schedule the 5-day follow-up. Returns null
 * silently when persistence wasn't requested or pre-conditions weren't met.
 */
async function maybePersist(
  body: RequestBody,
  session: DiagnosisSession,
  result: ReturnType<typeof finalise>
): Promise<{ sessionRowId: string; followupRowId: string | null } | null> {
  if (!body.persist || !body.farmId) return null;
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return null;
    return await persistDiagnosis(supabase, {
      session,
      result,
      farmId: body.farmId,
      userId: user.id,
    });
  } catch (err) {
    console.error("Persistence skipped:", err);
    return null;
  }
}
