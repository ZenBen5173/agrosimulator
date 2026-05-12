/**
 * Pure decision logic for the doctor-style diagnosis pipeline.
 *
 * EVERYTHING in this file must be a pure function — no I/O, no AI calls, no
 * randomness. This is the layer that gets unit-tested heavily and that we can
 * trust to behave deterministically.
 *
 * The Genkit flow orchestrates these pure functions around the LLM calls.
 */

import { rulesForCrop, ruleById } from "./malaysiaRules";
import type { MalaysiaDiseaseRule } from "./malaysiaRules";
import type {
  CropName,
  DiagnosisResult,
  DifferentialCandidate,
  HistoryQuestion,
  PhysicalTestPrompt,
  PhysicalTestType,
  SpreadPattern,
} from "./types";

// ─── Confidence → Outcome ────────────────────────────────────────

/**
 * Canonical confidence-to-outcome mapping. Same thresholds as 1.0
 * (preserve the established business logic).
 *   >= 0.85 → confirmed
 *   >= 0.60 → uncertain
 *   <  0.60 → cannot_determine
 */
export function outcomeFromConfidence(
  confidence: number
): DiagnosisResult["outcome"] {
  if (confidence >= 0.85) return "confirmed";
  if (confidence >= 0.6) return "uncertain";
  return "cannot_determine";
}

/** Tier-3 escalation kicks in when confidence is below the confirmed threshold. */
export function shouldSuggestEscalation(confidence: number): boolean {
  return confidence < 0.85;
}

// ─── Pattern question → biotic/abiotic prefilter ─────────────────

/**
 * The single most powerful diagnostic short-circuit. If the farmer says it's
 * affecting MULTIPLE crops (different species), it's almost certainly abiotic
 * (drainage, herbicide drift, weather, water quality) — biotic diseases are
 * usually host-specific.
 *
 * No other crop disease app asks this question first. They all jump to the
 * photo, which means they routinely misdiagnose abiotic stress as disease.
 */
export function patternImpliesAbiotic(pattern: SpreadPattern): boolean {
  return pattern === "multiple_crops";
}

/**
 * Apply the pattern filter to the candidate list. When abiotic-likely, mark
 * all biotic disease candidates as ruled out with a clear reason.
 */
export function applyPatternFilter(
  pattern: SpreadPattern,
  candidates: DifferentialCandidate[]
): DifferentialCandidate[] {
  if (!patternImpliesAbiotic(pattern)) return candidates;

  return candidates.map((c) => {
    const rule = ruleById(c.diseaseId);
    if (!rule) return c;
    // Keep all abiotic-class candidates in play — they're the LIKELY cause
    // when multiple crop species are affected. Also keep nematode in play
    // (wide host range — Meloidogyne hits 2000+ plant species, so it CAN
    // damage multiple crops in the same plot).
    if (
      rule.category === "abiotic" ||
      rule.category === "abiotic_water" ||
      rule.category === "abiotic_heat" ||
      rule.category === "abiotic_chemical" ||
      rule.category === "nutrient_deficiency" ||
      rule.category === "nematode"
    ) {
      return c;
    }
    return {
      ...c,
      ruledOut: true,
      ruleOutReason:
        "You said the problem affects different crops too — biotic diseases like this one are almost always host-specific. The cause is more likely abiotic (drainage, herbicide drift, water quality, weather damage).",
    };
  });
}

// ─── Initial candidate seeding ───────────────────────────────────

/**
 * Build the initial candidate set for a crop, with uniform priors.
 * The LLM (or weather priors) will adjust probabilities upward later.
 */
export function seedCandidatesForCrop(
  crop: CropName
): DifferentialCandidate[] {
  const rules = rulesForCrop(crop);
  if (rules.length === 0) return [];
  const uniformPrior = 1 / rules.length;
  return rules.map((r) => ({
    diseaseId: r.id,
    name: r.name,
    scientificName: r.scientificName,
    probability: uniformPrior,
    ruledOut: false,
  }));
}

// ─── Weather priors ──────────────────────────────────────────────

export interface WeatherSummary {
  rainyDaysLast7?: number;
  avgHumidityLast7?: number;
  consecutiveHotDays?: number;
}

/**
 * Bump the probability of diseases whose weather triggers match recent weather.
 * Returns a NEW array — does not mutate.
 */
export function applyWeatherPriors(
  candidates: DifferentialCandidate[],
  weather: WeatherSummary | undefined
): DifferentialCandidate[] {
  if (!weather) return candidates;

  return candidates.map((c) => {
    if (c.ruledOut) return c;
    const rule = ruleById(c.diseaseId);
    if (!rule?.weatherTrigger) return c;

    let boost = 0;
    const t = rule.weatherTrigger;

    if (
      t.consecutiveRainyDays !== undefined &&
      weather.rainyDaysLast7 !== undefined &&
      weather.rainyDaysLast7 >= t.consecutiveRainyDays
    ) {
      boost += 0.2;
    }
    if (
      t.minHumidity !== undefined &&
      weather.avgHumidityLast7 !== undefined &&
      weather.avgHumidityLast7 >= t.minHumidity
    ) {
      boost += 0.15;
    }
    if (
      t.minConsecutiveHotDays !== undefined &&
      weather.consecutiveHotDays !== undefined &&
      weather.consecutiveHotDays >= t.minConsecutiveHotDays
    ) {
      boost += 0.15;
    }

    return { ...c, probability: Math.min(1, c.probability + boost) };
  });
}

// ─── Normalisation & ranking ─────────────────────────────────────

// Confidence ceilings — never let any in-play candidate exceed these
// after normalisation. Even if our rules ruled out everything else, our
// rules might be missing real causes (gaps in the knowledge base), so we
// always leave room for "we might be wrong".
const HARD_CONFIDENCE_CEILING = 0.92; // best case (multiple plausible candidates)
const LONE_SURVIVOR_CEILING = 0.84; // only 1 in-play left → suspicious, force "uncertain" outcome
const VIRUS_CONFIDENCE_CEILING = 0.7; // viruses look almost identical on photo — never claim "confirmed" without lab test

/**
 * Normalise probabilities of in-play candidates so they sum to 1, then
 * apply the confidence ceiling. Ruled-out candidates retain their (frozen)
 * probability for display purposes but are excluded from normalisation.
 *
 * Viruses get an extra-tight ceiling because ChiVMV / AMV / CMV / TSWV /
 * PMMoV all cause overlapping mosaic/mottle patterns that real plant
 * pathologists separate with ELISA or RT-PCR, not eyes. Capping at 0.7
 * pushes the outcome from "confirmed" (>=0.85) into "uncertain" (>=0.6),
 * which triggers the lab-escalation panel.
 */
export function normaliseCandidates(
  candidates: DifferentialCandidate[]
): DifferentialCandidate[] {
  const inPlay = candidates.filter((c) => !c.ruledOut);
  const sum = inPlay.reduce((acc, c) => acc + c.probability, 0);
  if (sum === 0) return candidates;

  // The ceiling depends on how many candidates we're choosing between.
  // If only one survived, our rules table likely has a gap — never let
  // that lonely survivor reach the "confirmed" 0.85 threshold, so the
  // farmer always sees the "Want a human expert?" escalation.
  const ceiling =
    inPlay.length === 1 ? LONE_SURVIVOR_CEILING : HARD_CONFIDENCE_CEILING;

  return candidates.map((c) => {
    if (c.ruledOut) return c;
    const normalised = c.probability / sum;
    const rule = ruleById(c.diseaseId);
    const isViral = rule?.category === "viral";
    const effectiveCeiling = isViral
      ? Math.min(ceiling, VIRUS_CONFIDENCE_CEILING)
      : ceiling;
    return { ...c, probability: Math.min(normalised, effectiveCeiling) };
  });
}

/** Sort: in-play first by probability desc, then ruled-out at the end. */
export function rankCandidates(
  candidates: DifferentialCandidate[]
): DifferentialCandidate[] {
  return [...candidates].sort((a, b) => {
    if (a.ruledOut !== b.ruledOut) return a.ruledOut ? 1 : -1;
    return b.probability - a.probability;
  });
}

// ─── Physical test selection ────────────────────────────────────

/**
 * Pick the ONE physical confirmation test that best discriminates between
 * the top remaining (in-play) candidates. We pick the test recommended by
 * the highest-probability candidate; in a tie, prefer the test with the
 * highest documented accuracy (stem-ooze test = 97%).
 */
export function selectPhysicalTest(
  candidates: DifferentialCandidate[]
): PhysicalTestPrompt | null {
  const inPlay = candidates.filter((c) => !c.ruledOut);
  if (inPlay.length === 0) return null;

  // If only 1 candidate left and confidence high enough, no test needed
  if (inPlay.length === 1 && inPlay[0].probability >= 0.85) return null;

  const sorted = [...inPlay].sort((a, b) => b.probability - a.probability);
  const top = sorted[0];
  const topRule = ruleById(top.diseaseId);
  if (!topRule) return null;

  const test = topRule.bestTest.test;

  return {
    test,
    instruction: topRule.bestTest.instruction,
    options: optionsForTest(test),
    outcomes: outcomesForTest(test, sorted, topRule),
  };
}

function optionsForTest(
  test: PhysicalTestType
): { value: string; label: string; emoji?: string }[] {
  switch (test) {
    case "cut_fruit_inspect_smell":
      return [
        { value: "sour", label: "Sour like vinegar", emoji: "🍋" },
        { value: "earthy", label: "Earthy like soil", emoji: "🍄" },
        { value: "fishy", label: "Fishy / rotten", emoji: "🐟" },
        { value: "sweet", label: "Sweet / fermented", emoji: "🍯" },
        { value: "none", label: "No smell", emoji: "🤷" },
      ];
    case "stem_ooze_water_glass":
      return [
        { value: "milky_ooze", label: "Yes — milky stream of bacteria", emoji: "✅" },
        { value: "no_ooze", label: "No ooze, water stays clear", emoji: "❌" },
      ];
    case "leaf_age_pattern":
      return [
        { value: "old_leaves", label: "Old (lower) leaves first" },
        { value: "new_leaves", label: "New (top) leaves first" },
        { value: "all_leaves", label: "All leaves at the same time" },
      ];
    case "lesion_margin_check":
      return [
        { value: "wavy", label: "Wavy / irregular margin" },
        { value: "linear", label: "Straight / linear margin" },
        { value: "frog_eye", label: "Concentric ring with pale centre" },
        { value: "spindle", label: "Spindle / football shape" },
        { value: "none_match", label: "None of these" },
      ];
    case "check_leaf_underside":
      return [
        { value: "tiny_dots", label: "Tiny moving dots / mites" },
        { value: "white_powder", label: "White powdery coating" },
        { value: "fuzzy_growth", label: "Fuzzy fungal growth" },
        { value: "clean", label: "Clean — nothing visible" },
      ];
    case "dig_root_inspect":
      return [
        { value: "dark_rotted", label: "Dark, soft, rotted roots" },
        { value: "knots_galls", label: "Knots or galls on roots" },
        { value: "white_healthy", label: "White, firm, healthy roots" },
      ];
    case "scratch_stem_alive":
      return [
        { value: "green_alive", label: "Green underneath — alive" },
        { value: "brown_dead", label: "Brown / dry — dead tissue" },
      ];
    case "no_test_needed":
      return [];
  }
}

function outcomesForTest(
  test: PhysicalTestType,
  sortedCandidates: DifferentialCandidate[],
  topRule: MalaysiaDiseaseRule
): PhysicalTestPrompt["outcomes"] {
  // Build outcome map per option. Tests defined in the rules table indicate
  // the EXPECTED result for the top candidate; matching that result confirms,
  // a clearly opposing result rules it out.
  const outcomes: PhysicalTestPrompt["outcomes"] = {};
  const opts = optionsForTest(test);

  for (const opt of opts) {
    outcomes[opt.value] = { confidenceBoost: 0 };
  }

  // Test-specific outcome wiring
  if (test === "cut_fruit_inspect_smell") {
    if (topRule.bestTest.smellExpected) {
      outcomes[topRule.bestTest.smellExpected] = {
        confirms: [topRule.id],
        confidenceBoost: 0.25,
      };
    }
    // No smell strongly implies abiotic / nutrient cause
    outcomes.none = {
      confirms: sortedCandidates
        .filter((c) => {
          const r = ruleById(c.diseaseId);
          return r?.category === "nutrient_deficiency";
        })
        .map((c) => c.diseaseId),
      rulesOut: sortedCandidates
        .filter((c) => {
          const r = ruleById(c.diseaseId);
          return r?.category === "fungal" || r?.category === "bacterial";
        })
        .map((c) => c.diseaseId),
      confidenceBoost: 0.2,
    };
  } else if (test === "stem_ooze_water_glass") {
    outcomes.milky_ooze = {
      confirms: [topRule.id],
      confidenceBoost: 0.4, // 97% accurate per literature
    };
    outcomes.no_ooze = {
      rulesOut: [topRule.id],
      confidenceBoost: 0.3,
    };
  } else if (test === "leaf_age_pattern") {
    // Different deficiencies start at different leaf ages; map accordingly
    for (const c of sortedCandidates) {
      const r = ruleById(c.diseaseId);
      if (!r) continue;
      // Mobile nutrients (N, P, K, Mg) → old leaves first
      // Immobile nutrients (Fe, Ca, B, S) → new leaves first
      if (r.id.includes("phosphorus") || r.id.includes("nitrogen") || r.id.includes("potassium")) {
        outcomes.old_leaves.confirms = [...(outcomes.old_leaves.confirms ?? []), r.id];
        outcomes.old_leaves.confidenceBoost = 0.2;
        outcomes.new_leaves.rulesOut = [...(outcomes.new_leaves.rulesOut ?? []), r.id];
      } else if (r.id.includes("iron") || r.id.includes("calcium")) {
        outcomes.new_leaves.confirms = [...(outcomes.new_leaves.confirms ?? []), r.id];
        outcomes.new_leaves.confidenceBoost = 0.2;
        outcomes.old_leaves.rulesOut = [...(outcomes.old_leaves.rulesOut ?? []), r.id];
      }
    }
  } else if (test === "lesion_margin_check") {
    // Wired per crop/disease: blast = spindle, blight = wavy, cercospora = frog_eye
    for (const c of sortedCandidates) {
      const r = ruleById(c.diseaseId);
      if (!r) continue;
      if (r.id === "paddy_blast") {
        outcomes.spindle.confirms = [...(outcomes.spindle.confirms ?? []), r.id];
        outcomes.spindle.confidenceBoost = 0.25;
      } else if (r.id === "paddy_bacterial_blight") {
        outcomes.wavy.confirms = [...(outcomes.wavy.confirms ?? []), r.id];
        outcomes.wavy.confidenceBoost = 0.25;
        outcomes.linear.rulesOut = [...(outcomes.linear.rulesOut ?? []), r.id];
      } else if (r.id === "chilli_cercospora") {
        outcomes.frog_eye.confirms = [...(outcomes.frog_eye.confirms ?? []), r.id];
        outcomes.frog_eye.confidenceBoost = 0.25;
      }
    }
  }

  return outcomes;
}

/**
 * Apply a physical test result to the current candidates: bump probabilities
 * for confirmed candidates, mark rule-outs.
 */
export function applyPhysicalTestResult(
  candidates: DifferentialCandidate[],
  prompt: PhysicalTestPrompt,
  resultValue: string
): DifferentialCandidate[] {
  const outcome = prompt.outcomes[resultValue];
  if (!outcome) return candidates;

  return candidates.map((c) => {
    if (c.ruledOut) return c;
    if (outcome.rulesOut?.includes(c.diseaseId)) {
      return {
        ...c,
        ruledOut: true,
        ruleOutReason: `Physical test result rules this out (${prompt.test} → ${resultValue})`,
      };
    }
    if (outcome.confirms?.includes(c.diseaseId)) {
      return {
        ...c,
        probability: Math.min(1, c.probability + outcome.confidenceBoost),
      };
    }
    return c;
  });
}

// ─── History question selection ─────────────────────────────────

/**
 * Generate the top-N adaptive history questions to ask, prioritised by what
 * would best discriminate the remaining in-play candidates. We use a small
 * fixed catalogue that maps onto the things real plant doctors ask.
 */
export function selectHistoryQuestions(
  candidates: DifferentialCandidate[],
  max = 3
): HistoryQuestion[] {
  const inPlay = candidates.filter((c) => !c.ruledOut);
  const inPlayIds = new Set(inPlay.map((c) => c.diseaseId));

  const all: HistoryQuestion[] = [
    {
      id: "onset",
      text: "When did you first notice the problem?",
      options: [
        { value: "today", label: "Today (sudden)" },
        { value: "this_week", label: "Past few days (gradual)" },
        { value: "longer", label: "More than a week ago" },
      ],
      discriminates: ["chilli_bacterial_wilt", "chilli_phosphorus_deficiency", "chilli_iron_deficiency"],
    },
    {
      id: "weather",
      text: "What has the weather been like recently?",
      options: [
        { value: "rainy", label: "Rainy several days in a row" },
        { value: "hot_dry", label: "Hot and dry" },
        { value: "humid", label: "Hot and humid" },
        { value: "normal", label: "Normal / mixed" },
      ],
      discriminates: ["chilli_anthracnose", "chilli_cercospora", "paddy_blast", "paddy_bacterial_blight"],
    },
    {
      id: "recent_chemicals",
      text: "Have you sprayed or applied anything in the last 2 weeks?",
      options: [
        { value: "fertiliser", label: "Fertiliser only" },
        { value: "pesticide", label: "Pesticide / fungicide" },
        { value: "herbicide_nearby", label: "Herbicide on a neighbouring plot" },
        { value: "nothing", label: "Nothing" },
      ],
      discriminates: [], // mostly used to detect chemical injury (abiotic)
    },
    {
      id: "soil_drainage",
      text: "Does this plot drain well after heavy rain?",
      options: [
        { value: "well_drained", label: "Drains within hours" },
        { value: "puddles", label: "Puddles for a day" },
        { value: "waterlogged", label: "Stays waterlogged" },
      ],
      discriminates: ["chilli_bacterial_wilt", "chilli_waterlogging"],
    },
    {
      id: "last_watered",
      text: "When did you last water this plot?",
      options: [
        { value: "today", label: "Today" },
        { value: "yesterday", label: "Yesterday" },
        { value: "two_three_days", label: "2-3 days ago" },
        { value: "longer", label: "More than 3 days ago" },
        { value: "rain_only", label: "Rely on rain only" },
      ],
      discriminates: ["chilli_water_stress", "chilli_waterlogging"],
    },
  ];

  // Score each question by how many in-play candidates it discriminates
  const scored = all
    .map((q) => ({
      q,
      score: q.discriminates.filter((id) => inPlayIds.has(id)).length,
    }))
    // Always include onset + weather as universal
    .map((s) => ({ ...s, score: ["onset", "weather"].includes(s.q.id) ? s.score + 1 : s.score }))
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, max).map((s) => s.q);
}

// ─── Prescription builder ───────────────────────────────────────

/**
 * Build the two-part Plantwise-style prescription from the rules table.
 * Returns null if the disease has no chemical control or if escalation
 * is the appropriate response.
 */
export function buildPrescription(
  diseaseId: string
): DiagnosisResult["prescription"] {
  const rule = ruleById(diseaseId);
  if (!rule) return null;

  return {
    controlNow: {
      chemical: rule.treatment.chemical
        ? {
            name: rule.treatment.chemical.name,
            brand: rule.treatment.chemical.brandLocal,
            dose: rule.treatment.chemical.dose,
            frequency: rule.treatment.chemical.frequency,
            estCostRm: rule.treatment.chemical.estCostRm?.generic,
          }
        : undefined,
      cultural: rule.treatment.cultural,
    },
    preventRecurrence: rule.treatment.preventRecurrence,
  };
}

// ─── Final diagnosis assembly ───────────────────────────────────

/**
 * Take the final set of candidates after all evidence and assemble the
 * structured DiagnosisResult that the UI will render.
 */
export function assembleDiagnosis(
  candidates: DifferentialCandidate[],
  context: { historyAnswers?: { question: string; answer: string }[] }
): DiagnosisResult {
  const ranked = rankCandidates(normaliseCandidates(candidates));
  const inPlay = ranked.filter((c) => !c.ruledOut);
  const ruledOutItems = ranked.filter((c) => c.ruledOut);

  if (inPlay.length === 0) {
    return {
      outcome: "cannot_determine",
      confidence: 0,
      diagnosis: null,
      reasoning: {
        whySure: [],
        whatRuledOut: ruledOutItems.map((c) => ({
          name: c.name,
          because: c.ruleOutReason ?? "Ruled out by evidence",
        })),
        whatStillUncertain: ["All candidates ruled out — likely abiotic or unknown cause."],
      },
      prescription: null,
      escalation: {
        suggested: true,
        options: ["doa_lab", "mardi_officer", "neighbour_vote"],
        reason: "All disease candidates ruled out. Submit a sample for lab analysis or ask the community.",
      },
    };
  }

  const top = inPlay[0];
  const outcome = outcomeFromConfidence(top.probability);

  const whySure: string[] = [];
  if (context.historyAnswers) {
    for (const a of context.historyAnswers) {
      if (a.answer === "rainy" || a.answer === "humid") {
        whySure.push("Recent weather (rain/humidity) favours this pathogen");
      }
    }
  }

  return {
    outcome,
    confidence: Math.round(top.probability * 100) / 100,
    diagnosis:
      outcome === "cannot_determine"
        ? null
        : {
            diseaseId: top.diseaseId,
            name: top.name,
            scientificName: top.scientificName,
            severity: severityFromConfidence(top.probability),
          },
    reasoning: {
      whySure,
      whatRuledOut: ruledOutItems.map((c) => ({
        name: c.name,
        because: c.ruleOutReason ?? "Ruled out by evidence",
      })),
      whatStillUncertain:
        outcome === "uncertain"
          ? [`Confidence is ${Math.round(top.probability * 100)}%, between ${top.name} and ${inPlay[1]?.name ?? "alternatives"}`]
          : [],
    },
    prescription:
      outcome === "cannot_determine" ? null : buildPrescription(top.diseaseId),
    escalation: shouldSuggestEscalation(top.probability)
      ? {
          suggested: true,
          options: ["doa_lab", "mardi_officer", "neighbour_vote"],
          reason: `Confidence ${Math.round(top.probability * 100)}% is below the 85% threshold — a real expert can confirm or reject the diagnosis.`,
        }
      : null,
  };
}

function severityFromConfidence(confidence: number): "mild" | "moderate" | "severe" {
  // Severity isn't really a function of confidence — it's a property of the
  // disease + visible damage extent. The LLM should override this in the
  // Genkit flow. For now we use confidence as a coarse proxy + default mid.
  if (confidence > 0.95) return "severe";
  return "moderate";
}
