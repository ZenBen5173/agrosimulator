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
  getExtraPhotoRequests,
  normaliseCandidates,
  normaliseHistoryAnswer,
  rankCandidates,
  seedCandidatesForCrop,
  selectHistoryQuestions,
  selectPhysicalTest,
  type WeatherSummary,
} from "@/lib/diagnosis/decisionLogic";
import { duoLayerVisionFlow, visionDifferentialFlow } from "@/flows/doctorDiagnosis";
import type {
  CropName,
  DiagnosisResult,
  DiagnosisSession,
  DifferentialCandidate,
  ExtraPhoto,
  ExtraPhotoKind,
  ExtraPhotoRequest,
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
  /**
   * Per-disease prior boost multipliers (from plot history + cross-farm
   * outbreak signal). Applied to the seeded uniform priors before
   * normalisation, so diseases the plot has had before / that are
   * sweeping the district get a head start in the differential.
   */
  priorBoosts?: Record<string, number>;
}): DiagnosisSession {
  let candidates = seedCandidatesForCrop(input.crop);
  if (input.priorBoosts && Object.keys(input.priorBoosts).length > 0) {
    candidates = applyPriorBoosts(candidates, input.priorBoosts);
  }
  return {
    sessionId: randomUUID(),
    crop: input.crop,
    plotId: input.plotId,
    plotLabel: input.plotLabel,
    startedAt: new Date().toISOString(),
    candidates,
    historyAnswers: [],
    recentWeather: input.recentWeather,
  };
}

/**
 * Multiply each candidate's seeded probability by its boost (default 1.0).
 * This is the entry point for plot-history + cross-farm-outbreak priors.
 * Pure function so it can be unit-tested.
 */
export function applyPriorBoosts(
  candidates: DifferentialCandidate[],
  boosts: Record<string, number>
): DifferentialCandidate[] {
  return candidates.map((c) => ({
    ...c,
    probability: c.probability * (boosts[c.diseaseId] ?? 1),
  }));
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

export interface AnalysePhotoResult {
  session: DiagnosisSession;
  observations: string[];
  photoQuality: string;
  /**
   * If the model detected the photo shows a different species than the
   * farmer's chosen crop, this is non-null. The UI should short-circuit and
   * surface a "wrong crop" result instead of asking history/test questions.
   */
  cropMismatch: {
    detected: boolean;
    actualPlant: string | null;
    note: string | null;
  };
}

export async function analysePhoto(
  session: DiagnosisSession,
  photoBase64: string,
  photoMimeType: string
): Promise<AnalysePhotoResult> {
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

  // The model may flag cropMismatch (it thinks the photo isn't the chosen
  // crop) — we surface this as a SOFT warning to the UI but DON'T destroy
  // the differential. The farmer knows their crop better than the AI; the
  // UI offers an override ("It IS a chilli — diagnose anyway"). We just
  // run the normal merge so a real differential is available behind the
  // warning.
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
    cropMismatch: visionOutput.cropMismatch,
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
  // Free-text answers from the typed input are mapped to canonical values
  // here so the same boost logic fires whether the farmer tapped the
  // "Rainy" button or typed "It rained for 4 days last week".
  const canonical = normaliseHistoryAnswer(questionId, answer) ?? answer;
  let candidates = session.candidates;

  if (questionId === "weather" && canonical === "rainy") {
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

  if (questionId === "soil_drainage" && canonical === "waterlogged") {
    // Waterlogged plot strongly elevates bacterial wilt
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      if (c.diseaseId === "chilli_bacterial_wilt") {
        return { ...c, probability: Math.min(1, c.probability + 0.2) };
      }
      return c;
    });
  }

  if (questionId === "recent_chemicals" && canonical === "herbicide_nearby") {
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

  // Plant-stage rules out diseases that only happen at specific stages.
  // Damping-off is seedling-only; blossom end rot + fruit borer + anthracnose
  // need fruit; etc. This is a major accuracy lever — without it, the model
  // routinely lists "blossom end rot" as a candidate on a seedling.
  if (questionId === "plant_stage") {
    const stage = canonical;
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      if (c.diseaseId === "chilli_damping_off" && stage !== "seedling") {
        return {
          ...c,
          ruledOut: true,
          ruleOutReason:
            "Damping-off only collapses seedlings — past 4 weeks the stem is too lignified for Pythium / Rhizoctonia to take it down.",
        };
      }
      if (
        (c.diseaseId === "chilli_calcium_def_blossom_end_rot" ||
          c.diseaseId === "chilli_anthracnose" ||
          c.diseaseId === "chilli_fruit_borer" ||
          c.diseaseId === "chilli_choanephora_wet_rot" ||
          c.diseaseId === "chilli_bacterial_soft_rot" ||
          c.diseaseId === "chilli_sunscald") &&
        (stage === "seedling" || stage === "vegetative")
      ) {
        return {
          ...c,
          ruledOut: true,
          ruleOutReason:
            "This disease specifically affects fruit/flowers, but the plant hasn't reached fruiting stage yet.",
        };
      }
      return c;
    });
  }

  // Variety hint — Malaysian cultivars with known resistance shift priors.
  // MC11/MC12 carry ChiVMV tolerance; Kulai is anthracnose-susceptible. We
  // do not RULE OUT (resistance can break) but we down-weight strongly.
  if (questionId === "variety") {
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      if (canonical === "mc11_mc12" && c.diseaseId === "chilli_chivmv") {
        return { ...c, probability: c.probability * 0.4 };
      }
      if (canonical === "kulai" && c.diseaseId === "chilli_anthracnose") {
        return { ...c, probability: Math.min(1, c.probability + 0.15) };
      }
      return c;
    });
  }

  // Recent treatment rules out diseases that copper / mancozeb / systemic
  // fungicide WOULD have controlled if applied within 14 days. If they
  // sprayed copper a week ago and the problem persists, copper-controllable
  // candidates (bacterial leaf spot, Phytophthora) drop in probability.
  if (questionId === "last_treatment") {
    const COPPER_CONTROL = new Set([
      "chilli_bacterial_leaf_spot",
      "chilli_phytophthora_blight",
    ]);
    const MANCOZEB_CONTROL = new Set([
      "chilli_anthracnose",
      "chilli_cercospora",
      "chilli_choanephora_wet_rot",
    ]);
    candidates = candidates.map((c) => {
      if (c.ruledOut) return c;
      if (canonical === "copper" && COPPER_CONTROL.has(c.diseaseId)) {
        return { ...c, probability: c.probability * 0.5 };
      }
      if (canonical === "mancozeb" && MANCOZEB_CONTROL.has(c.diseaseId)) {
        return { ...c, probability: c.probability * 0.5 };
      }
      return c;
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

// ─── Reference comparison verdict ───────────────────────────────

/**
 * After the result page shows the leading diagnosis with its textbook
 * signs, the farmer can tap "yes that matches" or "no that doesn't
 * match." This is a HUGE accuracy lever — the farmer has the actual
 * plant in front of them and can verify what the AI predicted.
 *
 *   matches=true  → boost that candidate's probability +0.10 (caps still
 *                   apply); the farmer's eyeball confirmation is strong
 *                   evidence the diagnosis is correct.
 *   matches=false → rule out that candidate with reason; orchestrator
 *                   then assembles a new result from whatever's left.
 *                   This catches model hallucinations the farmer can see
 *                   immediately.
 *
 * Returns the updated session AND the new finalised result.
 */
export function applyReferenceVerdict(
  session: DiagnosisSession,
  args: { diseaseId: string; matches: boolean }
): { session: DiagnosisSession; result: DiagnosisResult } {
  const updated = session.candidates.map((c) => {
    if (c.diseaseId !== args.diseaseId) return c;
    if (args.matches) {
      return { ...c, probability: Math.min(1, c.probability + 0.1) };
    }
    return {
      ...c,
      ruledOut: true,
      ruleOutReason:
        "Farmer compared photo to the textbook signs and said it doesn't match — strong signal to rule this out.",
    };
  });
  const ranked = rankCandidates(normaliseCandidates(updated));
  const newSession: DiagnosisSession = {
    ...session,
    candidates: ranked,
    referenceVerdict: {
      diseaseId: args.diseaseId,
      matches: args.matches,
      answeredAt: new Date().toISOString(),
    },
  };
  const result = finalise(newSession);
  return { session: newSession, result };
}

// ─── Layer 2: duo-layer diagnosis ───────────────────────────────

/**
 * Returns the targeted extra-photo requests Layer 2 wants the farmer to
 * take, plus a snapshot of the Layer 1 result. The UI uses this to render
 * the "Get a clearer answer" CTA: shows what's still uncertain, what
 * photos would help, and the user's current best guess.
 */
export function getLayerTwoPlan(session: DiagnosisSession): {
  layerOneResult: DiagnosisResult;
  requests: ExtraPhotoRequest[];
} {
  const layerOneResult = finalise(session);
  const requests = getExtraPhotoRequests(session.candidates);
  return { layerOneResult, requests };
}

/**
 * Run vision on a single Layer-2 photo with the candidate context that's
 * still in play, then merge the result into the session. Each extra photo
 * adds corroborating evidence; we accumulate them in `session.extraPhotos`
 * and update probabilities. We do NOT lift ceilings here — that happens
 * once at finaliseDuoLayer below, after all extra photos are in.
 *
 * @param session     current session (must have completed Layer 1 — i.e.
 *                    have a photoBase64 and a pattern)
 * @param kind        which kind of photo this is (stem cross-section, etc.).
 *                    Optional — when undefined, the photo is treated as a
 *                    generic close-up and the model gets no kind hint.
 * @param photoBase64 the new photo
 * @param mime        MIME type of the new photo
 */
export async function applyExtraPhoto(
  session: DiagnosisSession,
  kind: ExtraPhotoKind | undefined,
  photoBase64: string,
  mime: string
): Promise<{ session: DiagnosisSession; observations: string[] }> {
  if (!session.pattern) {
    throw new Error("Cannot add extra photo before pattern question is answered");
  }
  if (!session.photoBase64) {
    throw new Error("Cannot add extra photo before Layer 1 photo is uploaded");
  }

  const inPlay = session.candidates.filter((c) => !c.ruledOut);
  const candidateIds = inPlay.map((c) => c.diseaseId);

  // Re-use the existing vision flow; the kind metadata is folded into the
  // observations so the model knows this is a stem-cut close-up vs a leaf
  // underside, etc. (See doctorDiagnosis flow for the prompt that picks
  // this up.)
  const visionOutput = await visionDifferentialFlow({
    photoBase64,
    photoMimeType: mime,
    crop: session.crop,
    candidateIds,
    pattern: session.pattern,
    extraPhotoKind: kind,
  });

  const observations = visionOutput.observations;

  // Merge the new vision output into existing candidates. Probabilities
  // are AVERAGED with the existing ones (gives the new photo equal weight).
  // Ruled-out by photo evidence stays ruled out.
  const merged = session.candidates.map((c) => {
    if (c.ruledOut) return c;
    const v = visionOutput.candidates.find((x) => x.diseaseId === c.diseaseId);
    if (!v) return c;
    if (v.ruledOut) {
      return {
        ...c,
        ruledOut: true,
        ruleOutReason:
          v.ruleOutReason ??
          `Layer 2 photo${kind ? ` (${kind})` : ""} ruled this out`,
      };
    }
    // Average with existing — corroboration boosts, contradiction tempers.
    const blendedProb = (c.probability + v.probability) / 2;
    return { ...c, probability: blendedProb };
  });

  // When the farmer didn't specify a kind, store as a generic close-up.
  // The lifted-ceiling logic in finaliseDuoLayer keys off SPECIFIC kinds
  // (stem_cross_section, new_growth_close_up, etc.); generic photos add
  // corroborating signal but don't unlock the wilt/virus ceiling lifts.
  const newExtraPhoto: ExtraPhoto = {
    kind: kind ?? "whole_plant_pattern", // safest fallback — least specific
    base64: photoBase64,
    mime,
    observations,
    takenAt: new Date().toISOString(),
  };

  return {
    session: {
      ...session,
      candidates: rankCandidates(normaliseCandidates(merged)),
      extraPhotos: [...(session.extraPhotos ?? []), newExtraPhoto],
    },
    observations,
  };
}

/**
 * Final Layer 2 diagnosis. Lifts the per-group photo ceilings (virus
 * 0.55→0.78, vascular wilt 0.70→0.88) when the corresponding extra photo
 * has been collected, because corroborating views are MORE diagnostic
 * information than a single leaf shot. This is honest, not arbitrary —
 * a stem cross-section actually CAN tell Verticillium from Fusarium where
 * a leaf alone cannot.
 *
 * The Layer 1 result is preserved on the session so the UI can show the
 * confidence diff ("was 70% wilt → now 88% Verticillium").
 *
 * Uses a SINGLE multi-image Gemini call (`duoLayerVisionFlow`) so the
 * model can cross-reference photos against each other — far better than
 * the per-photo averaging the original applyExtraPhoto did. Falls back
 * to the per-photo merge if the multi-image call fails or no extras.
 */
export async function finaliseDuoLayer(
  session: DiagnosisSession
): Promise<DiagnosisResult> {
  const extras = session.extraPhotos ?? [];

  // No extras → just finalise on whatever Layer 1 produced.
  if (extras.length === 0 || !session.photoBase64 || !session.photoMimeType) {
    return finalise(session);
  }

  const inPlay = session.candidates.filter((c) => !c.ruledOut);
  const candidateIds = inPlay.map((c) => c.diseaseId);

  let multiImageOutput: Awaited<ReturnType<typeof duoLayerVisionFlow>> | null = null;
  try {
    multiImageOutput = await duoLayerVisionFlow({
      originalPhotoBase64: session.photoBase64,
      originalPhotoMimeType: session.photoMimeType,
      extraPhotos: extras.map((e) => ({
        base64: e.base64,
        mime: e.mime,
        kind: e.kind,
      })),
      crop: session.crop,
      candidateIds,
      pattern: session.pattern!,
      currentCandidates: session.candidates.map((c) => ({
        diseaseId: c.diseaseId,
        probability: c.probability,
        ruledOut: c.ruledOut,
      })),
    });
  } catch (err) {
    console.warn("Multi-image Layer 2 call failed, falling back:", err);
  }

  // Merge multi-image output into session candidates if available
  let mergedCandidates = session.candidates;
  if (multiImageOutput) {
    mergedCandidates = mergeVisionOutput(
      session.candidates,
      multiImageOutput.candidates
    );
  }

  const lifted = liftCeilingsForCorroboration(mergedCandidates, extras);
  const ranked = rankCandidates(normaliseCandidates(lifted));
  const result = assembleDiagnosis(ranked, {
    historyAnswers: session.historyAnswers.map((a) => ({
      question: a.question,
      answer: a.answer,
    })),
  });
  return result;
}

/**
 * Lift the photo-step probability caps when corroborating extra photos
 * are present. Logic:
 *   - stem_cross_section + (any wilt in play) → wilt cap lifts toward 0.88
 *   - new_growth_close_up + fruit_close_up + (any virus) → virus cap lifts to 0.78
 *   - leaf_underside + (foliar pest) → no cap to lift (pests aren't capped),
 *     but rules out competing causes via the extra observations
 *
 * Implementation: scale up the in-play probabilities of the affected
 * group BEFORE normalisation reapplies its own ceiling. We do this in a
 * targeted way (not blanket) so adding a leaf-underside photo doesn't
 * inflate Verticillium confidence, etc.
 */
function liftCeilingsForCorroboration(
  candidates: DifferentialCandidate[],
  extras: ExtraPhoto[]
): DifferentialCandidate[] {
  const kinds = new Set(extras.map((e) => e.kind));
  const hasStemCut = kinds.has("stem_cross_section") || kinds.has("stem_in_water");
  const hasVirusCorroboration =
    kinds.has("new_growth_close_up") && kinds.has("fruit_close_up");

  const VASCULAR_WILT = new Set([
    "chilli_verticillium_wilt",
    "chilli_fusarium_wilt",
    "chilli_bacterial_wilt",
  ]);
  const VIRAL = new Set([
    "chilli_chivmv",
    "chilli_amv",
    "chilli_cmv",
    "chilli_tswv",
    "chilli_pmmov",
    "chilli_tmv",
  ]);

  // Lift target — what the multi-photo cap should be (vs the single-photo
  // cap baked into normaliseCandidates). The wilt list and virus list both
  // get ~0.85 headroom which is well above the "confirmed" 0.85 threshold.
  const WILT_LIFTED = 0.88;
  const VIRUS_LIFTED = 0.78;

  return candidates.map((c) => {
    if (c.ruledOut) return c;
    if (hasStemCut && VASCULAR_WILT.has(c.diseaseId)) {
      return { ...c, probability: Math.max(c.probability, WILT_LIFTED) };
    }
    if (hasVirusCorroboration && VIRAL.has(c.diseaseId)) {
      return { ...c, probability: Math.max(c.probability, VIRUS_LIFTED) };
    }
    return c;
  });
}
