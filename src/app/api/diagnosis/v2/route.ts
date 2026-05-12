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
} from "@/services/diagnosis/orchestrator";
import { persistDiagnosis } from "@/services/diagnosis/persistence";
import { createClient } from "@/lib/supabase/server";
import type { CropName, DiagnosisSession, SpreadPattern } from "@/lib/diagnosis/types";

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
    | "finalise";
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
        const session = startDiagnosis({
          crop: body.crop,
          plotId: body.plotId,
          plotLabel: body.plotLabel,
          recentWeather: body.recentWeather,
        });
        return NextResponse.json({ session });
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
        return NextResponse.json({
          session: result.session,
          observations: result.observations,
          photoQuality: result.photoQuality,
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
