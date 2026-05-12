/**
 * AgroSim 2.0 — Doctor-style diagnosis orchestrator.
 *
 * Stateless step functions that take the current session state and return the
 * next state. The session lives in the request/response or a Supabase row;
 * this file does not own persistence.
 *
 * The flow is deliberately broken into discrete steps so the UI can render
 * intermediate state (the differential ladder, the test prompt) and the
 * farmer can see the AI's reasoning unfold.
 */

import { randomUUID } from "node:crypto";
import {
  applyPatternFilter,
  applyPhysicalTestResult as applyTestResultPure,
  applyWeatherPriors,
  assembleDiagnosis,
  normaliseCandidates,
  rankCandidates,
  seedCandidatesForCrop,
  selectHistoryQuestions,
  selectPhysicalTest,
  type WeatherSummary,
} from "@/lib/diagnosis/decisionLogic";
import { visionDifferentialFlow } from "@/flows/doctorDiagnosis";
import type {
  CropName,
  DiagnosisResult,
  DiagnosisSession,
  DifferentialCandidate,
  HistoryQuestion,
  PhysicalTestPrompt,
  SpreadPattern,
} from "@/lib/diagnosis/types";

// ─── Session lifecycle ──────────────────────────────────────────

export function startDiagnosis(input: {
  crop: CropName;
  plotId?: string;
  plotLabel?: string;
  recentWeather?: WeatherSummary;
}): DiagnosisSession {
  return {
    sessionId: randomUUID(),
    crop: input.crop,
    plotId: input.plotId,
    plotLabel: input.plotLabel,
    startedAt: new Date().toISOString(),
    candidates: seedCandidatesForCrop(input.crop),
    historyAnswers: [],
    recentWeather: input.recentWeather,
  };
}

// ─── Step 2: pattern question ───────────────────────────────────

export function applyPattern(
  session: DiagnosisSession,
  pattern: SpreadPattern
): DiagnosisSession {
  let candidates = applyPatternFilter(pattern, session.candidates);
  candidates = applyWeatherPriors(candidates, session.recentWeather);
  candidates = normaliseCandidates(candidates);
  candidates = rankCandidates(candidates);
  return { ...session, pattern, candidates };
}

// ─── Step 3 + 4: photo analysis with vision differential ────────

export async function analysePhoto(
  session: DiagnosisSession,
  photoBase64: string,
  photoMimeType: string
): Promise<{ session: DiagnosisSession; observations: string[]; photoQuality: string }> {
  if (!session.pattern) {
    throw new Error(
      "Cannot analyse photo before pattern question is answered (Step 2)."
    );
  }

  // Pull current in-play candidate IDs to send to the model
  const inPlay = session.candidates.filter((c) => !c.ruledOut);
  const candidateIds = inPlay.map((c) => c.diseaseId);

  // Call vision flow
  const visionOutput = await visionDifferentialFlow({
    photoBase64,
    photoMimeType,
    crop: session.crop,
    candidateIds,
    pattern: session.pattern,
  });

  // Merge vision output back into session candidates
  const updated = mergeVisionOutput(session.candidates, visionOutput.candidates);
  const normalised = normaliseCandidates(updated);
  const ranked = rankCandidates(normalised);

  return {
    session: {
      ...session,
      photoBase64,
      photoMimeType,
      candidates: ranked,
    },
    observations: visionOutput.observations,
    photoQuality: visionOutput.photoQuality,
  };
}

function mergeVisionOutput(
  current: DifferentialCandidate[],
  visionCandidates: {
    diseaseId: string;
    probability: number;
    ruledOut: boolean;
    ruleOutReason: string | null;
    positiveEvidence: string[];
  }[]
): DifferentialCandidate[] {
  return current.map((c) => {
    if (c.ruledOut) return c; // already ruled out by pattern filter, don't unrule
    const v = visionCandidates.find((x) => x.diseaseId === c.diseaseId);
    if (!v) return c;
    return {
      ...c,
      probability: v.probability,
      ruledOut: v.ruledOut,
      ruleOutReason: v.ruledOut
        ? v.ruleOutReason ?? "Photo evidence rules this out"
        : c.ruleOutReason,
    };
  });
}

// ─── Step 5: history questions ──────────────────────────────────

export function getHistoryQuestions(
  session: DiagnosisSession,
  max = 3
): HistoryQuestion[] {
  return selectHistoryQuestions(session.candidates, max);
}

export function applyHistoryAnswer(
  session: DiagnosisSession,
  questionId: string,
  question: string,
  answer: string
): DiagnosisSession {
  // Apply deterministic adjustments based on key answers. The LLM could be
  // called here for richer reasoning, but keeping it deterministic now.
  let candidates = session.candidates;

  if (questionId === "weather" && answer === "rainy") {
    // Rainy weather boosts fungal/bacterial probabilities — already largely
    // handled by applyWeatherPriors at session start, but apply a small bump
    // here based on farmer's first-hand confirmation.
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      // Import within function to avoid cyclic concerns
      return {
        ...c,
        probability: Math.min(1, c.probability + 0.05),
      };
    });
  }

  if (questionId === "soil_drainage" && answer === "waterlogged") {
    // Waterlogged plot strongly elevates bacterial wilt
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      if (c.diseaseId === "chilli_bacterial_wilt") {
        return { ...c, probability: Math.min(1, c.probability + 0.2) };
      }
      return c;
    });
  }

  if (questionId === "recent_chemicals" && answer === "herbicide_nearby") {
    // Herbicide drift is a strong abiotic signal — rule out ALL biotic candidates
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      return {
        ...c,
        ruledOut: true,
        ruleOutReason:
          "Farmer reports herbicide spray on a neighbouring plot recently — drift damage looks very similar to disease but is abiotic. Inspect leaf edges for the typical curling/burn pattern of herbicide injury.",
      };
    });
  }

  return {
    ...session,
    candidates: rankCandidates(normaliseCandidates(candidates)),
    historyAnswers: [
      ...session.historyAnswers,
      { questionId, question, answer },
    ],
  };
}

// ─── Step 6: physical confirmation test ─────────────────────────

export function getPhysicalTest(
  session: DiagnosisSession
): PhysicalTestPrompt | null {
  return selectPhysicalTest(session.candidates);
}

export function applyPhysicalTestResult(
  session: DiagnosisSession,
  resultValue: string
): DiagnosisSession {
  const prompt = selectPhysicalTest(session.candidates);
  if (!prompt) return session;

  const updated = applyTestResultPure(session.candidates, prompt, resultValue);
  return {
    ...session,
    physicalTest: { test: prompt.test, result: resultValue },
    candidates: rankCandidates(normaliseCandidates(updated)),
  };
}

// ─── Step 7 + 8: finalise ───────────────────────────────────────

export function finalise(session: DiagnosisSession): DiagnosisResult {
  const result = assembleDiagnosis(session.candidates, {
    historyAnswers: session.historyAnswers.map((a) => ({
      question: a.question,
      answer: a.answer,
    })),
  });
  return result;
}
