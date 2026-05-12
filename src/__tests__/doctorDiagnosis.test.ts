import { describe, it, expect } from "vitest";
import {
  outcomeFromConfidence,
  shouldSuggestEscalation,
  patternImpliesAbiotic,
  applyPatternFilter,
  seedCandidatesForCrop,
  applyWeatherPriors,
  normaliseCandidates,
  rankCandidates,
  selectPhysicalTest,
  applyPhysicalTestResult,
  selectHistoryQuestions,
  buildPrescription,
  assembleDiagnosis,
} from "@/lib/diagnosis/decisionLogic";
import {
  MALAYSIA_RULES,
  rulesForCrop,
  ruleById,
} from "@/lib/diagnosis/malaysiaRules";
import type { DifferentialCandidate } from "@/lib/diagnosis/types";

// ─── Confidence → Outcome ────────────────────────────────────────

describe("outcomeFromConfidence", () => {
  it("returns confirmed at exactly 0.85", () => {
    expect(outcomeFromConfidence(0.85)).toBe("confirmed");
    expect(outcomeFromConfidence(1.0)).toBe("confirmed");
  });
  it("returns uncertain in 0.60-0.84", () => {
    expect(outcomeFromConfidence(0.6)).toBe("uncertain");
    expect(outcomeFromConfidence(0.84)).toBe("uncertain");
  });
  it("returns cannot_determine below 0.60", () => {
    expect(outcomeFromConfidence(0.59)).toBe("cannot_determine");
    expect(outcomeFromConfidence(0)).toBe("cannot_determine");
  });
});

describe("shouldSuggestEscalation", () => {
  it("does not escalate at confirmed threshold", () => {
    expect(shouldSuggestEscalation(0.85)).toBe(false);
    expect(shouldSuggestEscalation(0.99)).toBe(false);
  });
  it("escalates below confirmed threshold", () => {
    expect(shouldSuggestEscalation(0.84)).toBe(true);
    expect(shouldSuggestEscalation(0.5)).toBe(true);
  });
});

// ─── Pattern question logic ──────────────────────────────────────

describe("patternImpliesAbiotic", () => {
  it("only multiple_crops implies abiotic", () => {
    expect(patternImpliesAbiotic("multiple_crops")).toBe(true);
    expect(patternImpliesAbiotic("one_plant")).toBe(false);
    expect(patternImpliesAbiotic("few_plants")).toBe(false);
    expect(patternImpliesAbiotic("whole_plot")).toBe(false);
  });
});

describe("applyPatternFilter", () => {
  it("does not modify candidates when pattern is biotic-compatible", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const filtered = applyPatternFilter("one_plant", candidates);
    expect(filtered.every((c) => !c.ruledOut)).toBe(true);
  });

  it("rules out biotic candidates when multiple_crops affected", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const filtered = applyPatternFilter("multiple_crops", candidates);

    const fungalCandidates = filtered.filter(
      (c) => ruleById(c.diseaseId)?.category === "fungal"
    );
    const bacterialCandidates = filtered.filter(
      (c) => ruleById(c.diseaseId)?.category === "bacterial"
    );
    const nutrientCandidates = filtered.filter(
      (c) => ruleById(c.diseaseId)?.category === "nutrient_deficiency"
    );

    expect(fungalCandidates.length).toBeGreaterThan(0);
    expect(fungalCandidates.every((c) => c.ruledOut)).toBe(true);
    expect(bacterialCandidates.every((c) => c.ruledOut)).toBe(true);
    // Nutrient deficiencies remain in play (they CAN be confused for abiotic damage)
    expect(nutrientCandidates.every((c) => !c.ruledOut)).toBe(true);
  });

  it("provides a clear ruleOutReason mentioning host specificity", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const filtered = applyPatternFilter("multiple_crops", candidates);
    const ruledOut = filtered.find((c) => c.ruledOut);
    expect(ruledOut?.ruleOutReason).toMatch(/host-specific|abiotic/i);
  });
});

// ─── Candidate seeding ──────────────────────────────────────────

describe("seedCandidatesForCrop", () => {
  it("produces one candidate per rule for chilli", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const rules = rulesForCrop("chilli");
    expect(candidates).toHaveLength(rules.length);
    expect(candidates.length).toBeGreaterThan(0);
  });

  it("assigns uniform priors that sum to 1", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const sum = candidates.reduce((acc, c) => acc + c.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("seeds candidates for kangkung, banana, corn, sweet_potato (now covered)", () => {
    expect(seedCandidatesForCrop("kangkung").length).toBeGreaterThan(0);
    expect(seedCandidatesForCrop("banana").length).toBeGreaterThan(0);
    expect(seedCandidatesForCrop("corn").length).toBeGreaterThan(0);
    expect(seedCandidatesForCrop("sweet_potato").length).toBeGreaterThan(0);
  });

  it("marks all initial candidates as in-play (not ruled out)", () => {
    const candidates = seedCandidatesForCrop("chilli");
    expect(candidates.every((c) => c.ruledOut === false)).toBe(true);
  });
});

// ─── Weather priors ──────────────────────────────────────────────

describe("applyWeatherPriors", () => {
  it("returns candidates unchanged when no weather data", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const result = applyWeatherPriors(candidates, undefined);
    expect(result).toEqual(candidates);
  });

  it("boosts anthracnose probability after consecutive rainy days", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const before = candidates.find((c) => c.diseaseId === "chilli_anthracnose")!;
    const after = applyWeatherPriors(candidates, {
      rainyDaysLast7: 5,
      avgHumidityLast7: 85,
    }).find((c) => c.diseaseId === "chilli_anthracnose")!;

    expect(after.probability).toBeGreaterThan(before.probability);
  });

  it("does not boost diseases without weather triggers", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const before = candidates.find((c) => c.diseaseId === "chilli_phosphorus_deficiency")!;
    const after = applyWeatherPriors(candidates, {
      rainyDaysLast7: 5,
      avgHumidityLast7: 85,
    }).find((c) => c.diseaseId === "chilli_phosphorus_deficiency")!;

    expect(after.probability).toBe(before.probability);
  });

  it("does not boost ruled-out candidates", () => {
    const candidates = seedCandidatesForCrop("chilli").map((c) =>
      c.diseaseId === "chilli_anthracnose"
        ? { ...c, ruledOut: true, ruleOutReason: "test" }
        : c
    );
    const after = applyWeatherPriors(candidates, {
      rainyDaysLast7: 5,
      avgHumidityLast7: 85,
    });
    const anthracnose = after.find((c) => c.diseaseId === "chilli_anthracnose")!;
    const before = candidates.find((c) => c.diseaseId === "chilli_anthracnose")!;
    expect(anthracnose.probability).toBe(before.probability);
  });

  it("caps boosted probability at 1", () => {
    const candidates: DifferentialCandidate[] = [
      {
        diseaseId: "chilli_anthracnose",
        name: "Anthracnose",
        probability: 0.9,
        ruledOut: false,
      },
    ];
    const after = applyWeatherPriors(candidates, {
      rainyDaysLast7: 7,
      avgHumidityLast7: 95,
    });
    expect(after[0].probability).toBeLessThanOrEqual(1);
  });
});

// ─── Normalisation & ranking ─────────────────────────────────────

describe("normaliseCandidates", () => {
  it("normalises in-play probabilities to sum to 1", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0.4, ruledOut: false },
      { diseaseId: "b", name: "B", probability: 0.2, ruledOut: false },
    ];
    const result = normaliseCandidates(candidates);
    const sum = result
      .filter((c) => !c.ruledOut)
      .reduce((acc, c) => acc + c.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("excludes ruled-out from normalisation and caps lone survivor at 0.84", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0.5, ruledOut: false },
      { diseaseId: "b", name: "B", probability: 0.5, ruledOut: true, ruleOutReason: "x" },
    ];
    const result = normaliseCandidates(candidates);
    const inPlay = result.find((c) => c.diseaseId === "a")!;
    // A lone survivor would naturally normalise to 1.0, but we cap it at 0.84
    // so the outcome stays "uncertain" — our rules might be missing the real cause.
    expect(inPlay.probability).toBeCloseTo(0.84, 5);
  });

  it("caps the strongest in-play candidate at 0.92 (multi-candidate ceiling)", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0.95, ruledOut: false },
      { diseaseId: "b", name: "B", probability: 0.05, ruledOut: false },
    ];
    const result = normaliseCandidates(candidates);
    const top = result.find((c) => c.diseaseId === "a")!;
    expect(top.probability).toBeLessThanOrEqual(0.92);
  });

  it("does nothing if all in-play probabilities sum to 0", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0, ruledOut: false },
    ];
    const result = normaliseCandidates(candidates);
    expect(result[0].probability).toBe(0);
  });
});

describe("rankCandidates", () => {
  it("places in-play candidates before ruled-out", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0.1, ruledOut: true, ruleOutReason: "x" },
      { diseaseId: "b", name: "B", probability: 0.3, ruledOut: false },
    ];
    const result = rankCandidates(candidates);
    expect(result[0].diseaseId).toBe("b");
    expect(result[1].diseaseId).toBe("a");
  });

  it("orders in-play candidates by probability descending", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0.2, ruledOut: false },
      { diseaseId: "b", name: "B", probability: 0.5, ruledOut: false },
      { diseaseId: "c", name: "C", probability: 0.3, ruledOut: false },
    ];
    const result = rankCandidates(candidates);
    expect(result.map((c) => c.diseaseId)).toEqual(["b", "c", "a"]);
  });
});

// ─── Physical test selection ────────────────────────────────────

describe("selectPhysicalTest", () => {
  it("returns null when no in-play candidates", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "a", name: "A", probability: 0.5, ruledOut: true, ruleOutReason: "x" },
    ];
    expect(selectPhysicalTest(candidates)).toBeNull();
  });

  it("returns null when single candidate is highly confident", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.95, ruledOut: false },
    ];
    expect(selectPhysicalTest(candidates)).toBeNull();
  });

  it("picks the cut-fruit-smell test for anthracnose", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.6, ruledOut: false },
      { diseaseId: "chilli_phosphorus_deficiency", name: "P deficiency", probability: 0.3, ruledOut: false },
    ];
    const test = selectPhysicalTest(candidates);
    expect(test?.test).toBe("cut_fruit_inspect_smell");
    expect(test?.options.find((o) => o.value === "sour")).toBeDefined();
  });

  it("picks the stem-ooze test for bacterial wilt", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_bacterial_wilt", name: "Bacterial Wilt", probability: 0.55, ruledOut: false },
      { diseaseId: "chilli_phosphorus_deficiency", name: "P deficiency", probability: 0.25, ruledOut: false },
    ];
    const test = selectPhysicalTest(candidates);
    expect(test?.test).toBe("stem_ooze_water_glass");
  });

  it("includes outcomes that boost confidence on confirming result", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_bacterial_wilt", name: "Bacterial Wilt", probability: 0.5, ruledOut: false },
    ];
    const test = selectPhysicalTest(candidates)!;
    expect(test.outcomes.milky_ooze.confirms).toContain("chilli_bacterial_wilt");
    expect(test.outcomes.milky_ooze.confidenceBoost).toBeGreaterThan(0);
  });
});

describe("applyPhysicalTestResult", () => {
  it("boosts probability when result confirms a candidate", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_bacterial_wilt", name: "Bacterial Wilt", probability: 0.5, ruledOut: false },
    ];
    const prompt = selectPhysicalTest(candidates)!;
    const result = applyPhysicalTestResult(candidates, prompt, "milky_ooze");
    expect(result[0].probability).toBeGreaterThan(0.5);
  });

  it("marks candidate as ruled out when test result rules it out", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_bacterial_wilt", name: "Bacterial Wilt", probability: 0.5, ruledOut: false },
    ];
    const prompt = selectPhysicalTest(candidates)!;
    const result = applyPhysicalTestResult(candidates, prompt, "no_ooze");
    expect(result[0].ruledOut).toBe(true);
    expect(result[0].ruleOutReason).toMatch(/test/i);
  });

  it("does nothing when test result is unknown", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_bacterial_wilt", name: "Bacterial Wilt", probability: 0.5, ruledOut: false },
    ];
    const prompt = selectPhysicalTest(candidates)!;
    const result = applyPhysicalTestResult(candidates, prompt, "garbage_value");
    expect(result).toEqual(candidates);
  });
});

// ─── History question selection ─────────────────────────────────

describe("selectHistoryQuestions", () => {
  it("returns at most max questions", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const qs = selectHistoryQuestions(candidates, 2);
    expect(qs.length).toBeLessThanOrEqual(2);
  });

  it("always includes onset + weather as universal questions in top picks", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const qs = selectHistoryQuestions(candidates, 3);
    const ids = qs.map((q) => q.id);
    expect(ids).toContain("onset");
    expect(ids).toContain("weather");
  });

  it("provides discriminating options for weather question", () => {
    const candidates = seedCandidatesForCrop("chilli");
    const qs = selectHistoryQuestions(candidates, 4);
    const weather = qs.find((q) => q.id === "weather")!;
    expect(weather.options.find((o) => o.value === "rainy")).toBeDefined();
    expect(weather.options.find((o) => o.value === "humid")).toBeDefined();
  });
});

// ─── Prescription builder ───────────────────────────────────────

describe("buildPrescription", () => {
  it("returns null for unknown disease", () => {
    expect(buildPrescription("nonexistent_id")).toBeNull();
  });

  it("includes chemical, brand, dose, frequency for anthracnose", () => {
    const p = buildPrescription("chilli_anthracnose");
    expect(p?.controlNow.chemical?.name).toMatch(/Mancozeb/i);
    expect(p?.controlNow.chemical?.brand).toBeDefined();
    expect(p?.controlNow.chemical?.dose).toBeDefined();
    expect(p?.controlNow.chemical?.frequency).toBeDefined();
  });

  it("returns no chemical for bacterial wilt (no effective control)", () => {
    const p = buildPrescription("chilli_bacterial_wilt");
    expect(p?.controlNow.chemical).toBeUndefined();
    expect(p?.controlNow.cultural.length).toBeGreaterThan(0);
  });

  it("includes prevention recommendations", () => {
    const p = buildPrescription("chilli_anthracnose");
    expect(p?.preventRecurrence.length).toBeGreaterThan(0);
  });
});

// ─── End-to-end assembly ────────────────────────────────────────

describe("assembleDiagnosis (end-to-end pure)", () => {
  it("returns cannot_determine when all candidates ruled out", () => {
    const candidates = seedCandidatesForCrop("chilli").map((c) => ({
      ...c,
      ruledOut: true,
      ruleOutReason: "test",
    }));
    const result = assembleDiagnosis(candidates, {});
    expect(result.outcome).toBe("cannot_determine");
    expect(result.diagnosis).toBeNull();
    expect(result.escalation?.suggested).toBe(true);
  });

  it("produces confirmed diagnosis with prescription when top candidate >= 0.85", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.9, ruledOut: false },
      { diseaseId: "chilli_cercospora", name: "Cercospora", probability: 0.05, ruledOut: false },
    ];
    const result = assembleDiagnosis(candidates, {});
    expect(result.outcome).toBe("confirmed");
    expect(result.diagnosis?.diseaseId).toBe("chilli_anthracnose");
    expect(result.prescription).not.toBeNull();
    expect(result.escalation).toBeNull();
  });

  it("produces uncertain diagnosis with escalation when top is 0.6-0.84", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.7, ruledOut: false },
      { diseaseId: "chilli_cercospora", name: "Cercospora", probability: 0.25, ruledOut: false },
    ];
    const result = assembleDiagnosis(candidates, {});
    expect(result.outcome).toBe("uncertain");
    expect(result.escalation?.suggested).toBe(true);
    expect(result.prescription).not.toBeNull();
  });

  it("includes ruled-out items in reasoning.whatRuledOut with reasons", () => {
    const candidates: DifferentialCandidate[] = [
      { diseaseId: "chilli_anthracnose", name: "Anthracnose", probability: 0.9, ruledOut: false },
      {
        diseaseId: "chilli_cercospora",
        name: "Cercospora",
        probability: 0.1,
        ruledOut: true,
        ruleOutReason: "No frog-eye rings observed",
      },
    ];
    const result = assembleDiagnosis(candidates, {});
    expect(result.reasoning.whatRuledOut).toHaveLength(1);
    expect(result.reasoning.whatRuledOut[0].name).toBe("Cercospora");
    expect(result.reasoning.whatRuledOut[0].because).toMatch(/frog-eye/i);
  });
});

// ─── Rules-table integrity ──────────────────────────────────────

describe("Malaysia rules table integrity", () => {
  it("has unique disease IDs", () => {
    const ids = MALAYSIA_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("every rule has at least one rule-out clause", () => {
    for (const rule of MALAYSIA_RULES) {
      expect(rule.ruleOutClauses.length).toBeGreaterThan(0);
    }
  });

  it("every rule has a best test defined", () => {
    for (const rule of MALAYSIA_RULES) {
      expect(rule.bestTest.test).toBeDefined();
      expect(rule.bestTest.instruction.length).toBeGreaterThan(0);
    }
  });

  it("every rule has at least one preventRecurrence recommendation", () => {
    for (const rule of MALAYSIA_RULES) {
      expect(rule.treatment.preventRecurrence.length).toBeGreaterThan(0);
    }
  });

  it("ruleById finds existing rules", () => {
    expect(ruleById("chilli_anthracnose")).toBeDefined();
    expect(ruleById("nonexistent")).toBeUndefined();
  });
});
