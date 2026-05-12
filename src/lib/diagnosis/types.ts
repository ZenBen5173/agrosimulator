/**
 * Type definitions for the AgroSim 2.0 doctor-style diagnosis pipeline.
 * See AGROSIM_2.0.md section 4.1 for the full design.
 */

export type CropName =
  | "paddy"
  | "chilli"
  | "kangkung"
  | "banana"
  | "corn"
  | "sweet_potato";

/**
 * The pattern-question answer — the FIRST question we ask, before any photo.
 * This single answer is the strongest splitter between biotic (real disease)
 * and abiotic (drainage, herbicide drift, weather damage) causes.
 */
export type SpreadPattern =
  | "one_plant" // single plant — most likely biotic
  | "few_plants" // a few plants in a row — biotic, possibly spreading
  | "whole_plot" // whole plot uniform — could be either
  | "multiple_crops"; // also on different crops — almost certainly abiotic

/**
 * Smell adjectives the farmer can pick after cutting a fruit/stem.
 * Smell is one of the most discriminating diagnostic signals real plant
 * pathologists use, but no consumer crop disease app surfaces it.
 *
 * - sour: bacterial breakdown (acetic compounds), e.g. anthracnose fruit, soft rot
 * - earthy: fungal mycelium, e.g. fusarium, downy mildew
 * - fishy: bacterial soft rot (advanced), some downy mildew
 * - sweet: late-stage fungal fermentation
 * - none: likely abiotic / nutrient / mechanical
 */
export type SmellAdjective = "sour" | "earthy" | "fishy" | "sweet" | "none";

/**
 * Physical confirmation tests the farmer can do in 30-90 seconds with their
 * own hands and no special tools. Each test is highly discriminating between
 * specific candidate disease pairs.
 */
export type PhysicalTestType =
  | "stem_ooze_water_glass" // bacterial wilt vs other wilts (97% accurate)
  | "cut_fruit_inspect_smell" // anthracnose, soft rot, deficiency
  | "check_leaf_underside" // mites, downy mildew, aphids
  | "dig_root_inspect" // root rot, nematodes, drainage
  | "scratch_stem_alive" // dieback vs alive tissue
  | "leaf_age_pattern" // mobile (N/K) vs immobile (Fe/Ca) deficiency
  | "lesion_margin_check" // bacterial blight vs leaf streak (wavy vs linear)
  | "no_test_needed"; // photo + history sufficient

/**
 * One candidate in the differential ladder. The UI shows up to ~5 of these,
 * with crossed-out ones marked ruledOut + ruleOutReason.
 */
export interface DifferentialCandidate {
  diseaseId: string; // matches MalaysiaDiseaseRule.id
  name: string; // human-friendly e.g. "Anthracnose"
  scientificName?: string;
  probability: number; // 0–1
  ruledOut: boolean;
  ruleOutReason?: string; // shown to farmer when ruledOut=true
}

/**
 * One follow-up history question, prioritised to discriminate the candidates
 * still in play.
 */
export interface HistoryQuestion {
  id: string;
  text: string;
  options: { value: string; label: string }[];
  /** Which candidate IDs this question would help discriminate */
  discriminates: string[];
}

/**
 * The selected physical confirmation test, with photo aids if available.
 */
export interface PhysicalTestPrompt {
  test: PhysicalTestType;
  instruction: string;
  options: { value: string; label: string; emoji?: string }[];
  /** Which candidate this result would confirm/rule out */
  outcomes: Record<
    string,
    { confirms?: string[]; rulesOut?: string[]; confidenceBoost: number }
  >;
}

/**
 * Final diagnosis with explicit ruling-out reasoning (Ohio State Q18 protocol:
 * "list what you did NOT find"). Two-part Plantwise prescription.
 */
export interface DiagnosisResult {
  outcome: "confirmed" | "uncertain" | "cannot_determine";
  confidence: number; // 0–1

  // The diagnosis itself (null when cannot_determine)
  diagnosis: {
    diseaseId: string;
    name: string;
    scientificName?: string;
    severity: "mild" | "moderate" | "severe";
  } | null;

  // Reasoning surfaced to farmer
  reasoning: {
    whySure: string[]; // positive evidence that supports diagnosis
    whatRuledOut: { name: string; because: string }[]; // counterfactual
    whatStillUncertain: string[]; // honest uncertainty
  };

  // Two-part prescription (Plantwise model)
  prescription: {
    controlNow: {
      chemical?: { name: string; brand?: string; dose: string; frequency: string; estCostRm?: number };
      cultural: string[]; // e.g. "remove infected fruit, do not compost"
    };
    preventRecurrence: string[]; // e.g. "drip not overhead, prune lower leaves"
  } | null;

  // Tier-3 escalation when uncertain
  escalation: {
    suggested: boolean;
    options: ("doa_lab" | "mardi_officer" | "neighbour_vote")[];
    reason: string;
  } | null;
}

/**
 * The complete state of an in-progress diagnosis session, persisted between
 * steps so each call to the AI is stateless.
 */
export interface DiagnosisSession {
  sessionId: string;
  crop: CropName;
  plotId?: string;
  plotLabel?: string;
  startedAt: string; // ISO

  // Step 2 — pattern question
  pattern?: SpreadPattern;

  // Step 3 — photo
  photoBase64?: string;
  photoMimeType?: string;

  // Step 4 — initial differential
  candidates: DifferentialCandidate[];

  // Step 5 — adaptive history
  historyAnswers: { questionId: string; question: string; answer: string }[];

  // Step 6 — physical test
  physicalTest?: { test: PhysicalTestType; result: string };

  // Recent weather context (auto-populated from plot location)
  recentWeather?: {
    rainyDaysLast7?: number;
    avgHumidityLast7?: number;
    consecutiveHotDays?: number;
  };

  // Final diagnosis (only set on completion)
  result?: DiagnosisResult;
}
