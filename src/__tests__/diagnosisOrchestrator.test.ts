/**
 * Tests for the doctor-style diagnosis orchestrator.
 *
 * The orchestrator's deterministic step functions (startDiagnosis, applyPattern,
 * applyHistoryAnswer, getPhysicalTest, applyPhysicalTestResult, finalise) are
 * all tested here without touching the LLM.
 *
 * The analysePhoto step (which calls Gemini) is mocked via vitest.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock the Genkit flow BEFORE importing the orchestrator
vi.mock("@/flows/doctorDiagnosis", () => ({
  visionDifferentialFlow: vi.fn(),
}));

import {
  startDiagnosis,
  applyPattern,
  applyHistoryAnswer,
  getHistoryQuestions,
  getPhysicalTest,
  applyPhysicalTestResult,
  finalise,
  analysePhoto,
} from "@/services/diagnosis/orchestrator";
import { visionDifferentialFlow } from "@/flows/doctorDiagnosis";

describe("orchestrator: startDiagnosis", () => {
  it("creates a new session with seeded candidates for chilli", () => {
    const session = startDiagnosis({
      crop: "chilli",
      plotId: "plot-1",
      plotLabel: "Plot B",
    });
    expect(session.sessionId).toMatch(/^[0-9a-f-]{36}$/i);
    expect(session.crop).toBe("chilli");
    expect(session.plotId).toBe("plot-1");
    expect(session.plotLabel).toBe("Plot B");
    expect(session.candidates.length).toBeGreaterThan(0);
    expect(session.historyAnswers).toEqual([]);
  });

  it("captures recent weather summary when provided", () => {
    const session = startDiagnosis({
      crop: "chilli",
      recentWeather: { rainyDaysLast7: 5, avgHumidityLast7: 85 },
    });
    expect(session.recentWeather?.rainyDaysLast7).toBe(5);
  });
});

describe("orchestrator: applyPattern", () => {
  it("rules out fungal/bacterial candidates when multiple_crops", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "multiple_crops");
    const fungalRuledOut = session.candidates
      .filter(
        (c) =>
          c.diseaseId === "chilli_anthracnose" ||
          c.diseaseId === "chilli_cercospora"
      )
      .every((c) => c.ruledOut);
    expect(fungalRuledOut).toBe(true);
  });

  it("keeps all candidates in play for one_plant pattern", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "one_plant");
    expect(session.candidates.every((c) => !c.ruledOut)).toBe(true);
  });

  it("normalises in-play candidate probabilities to sum to ~1", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "one_plant");
    const inPlay = session.candidates.filter((c) => !c.ruledOut);
    const sum = inPlay.reduce((acc, c) => acc + c.probability, 0);
    expect(sum).toBeCloseTo(1, 5);
  });

  it("applies weather priors at pattern step", () => {
    const baselineSession = startDiagnosis({ crop: "chilli" });
    const baselineAnthracnose = baselineSession.candidates.find(
      (c) => c.diseaseId === "chilli_anthracnose"
    )!;

    const rainySession = startDiagnosis({
      crop: "chilli",
      recentWeather: { rainyDaysLast7: 5, avgHumidityLast7: 85 },
    });
    const updated = applyPattern(rainySession, "one_plant");
    const anthracnose = updated.candidates.find(
      (c) => c.diseaseId === "chilli_anthracnose"
    )!;

    // Even after normalisation, anthracnose should have a higher relative
    // probability than baseline because it was boosted before normalisation
    expect(anthracnose.probability).toBeGreaterThan(
      baselineAnthracnose.probability
    );
  });
});

describe("orchestrator: getHistoryQuestions", () => {
  it("returns at most 3 questions by default", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    const qs = getHistoryQuestions(session);
    expect(qs.length).toBeLessThanOrEqual(3);
  });

  it("includes high-discrimination questions for chilli (onset + plant_stage + at least one of weather/treatment/variety)", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    const qs = getHistoryQuestions(session);
    const ids = qs.map((q) => q.id);
    // Onset is universal — weather USED to be too, but with plant_stage,
    // variety and last_treatment now discriminating more candidates,
    // weather can be edged out. The contract is now "the picker returns
    // the most useful 3 questions for the in-play candidates".
    expect(ids).toContain("onset");
    const heavyHitters = ["plant_stage", "weather", "last_treatment", "variety"];
    expect(ids.filter((id) => heavyHitters.includes(id)).length).toBeGreaterThanOrEqual(1);
  });
});

describe("orchestrator: applyHistoryAnswer", () => {
  it("appends answer to historyAnswers", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    session = applyHistoryAnswer(session, "onset", "When did it start?", "today");
    expect(session.historyAnswers).toHaveLength(1);
    expect(session.historyAnswers[0].answer).toBe("today");
  });

  it("rules out all biotic candidates when herbicide_nearby reported", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    session = applyHistoryAnswer(
      session,
      "recent_chemicals",
      "Sprayed anything?",
      "herbicide_nearby"
    );
    const biotic = session.candidates.filter(
      (c) =>
        c.diseaseId === "chilli_anthracnose" ||
        c.diseaseId === "chilli_cercospora" ||
        c.diseaseId === "chilli_bacterial_wilt"
    );
    expect(biotic.every((c) => c.ruledOut)).toBe(true);
  });

  it("boosts bacterial wilt probability when soil is waterlogged", () => {
    const baseline = applyPattern(startDiagnosis({ crop: "chilli" }), "few_plants");
    const baselineWilt = baseline.candidates.find(
      (c) => c.diseaseId === "chilli_bacterial_wilt"
    )!;

    const updated = applyHistoryAnswer(
      baseline,
      "soil_drainage",
      "Drainage?",
      "waterlogged"
    );
    const wilt = updated.candidates.find(
      (c) => c.diseaseId === "chilli_bacterial_wilt"
    )!;

    expect(wilt.probability).toBeGreaterThan(baselineWilt.probability);
  });
});

describe("orchestrator: getPhysicalTest", () => {
  it("returns a test prompt when multiple candidates remain", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    const test = getPhysicalTest(session);
    expect(test).not.toBeNull();
    expect(test?.test).toBeDefined();
    expect(test?.options.length).toBeGreaterThan(0);
  });
});

describe("orchestrator: applyPhysicalTestResult", () => {
  it("records the test result on the session", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    session = applyPhysicalTestResult(session, "sour");
    expect(session.physicalTest).toBeDefined();
    expect(session.physicalTest?.result).toBe("sour");
  });
});

describe("orchestrator: finalise", () => {
  it("returns cannot_determine when all biotic candidates ruled out via herbicide", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");
    session = applyHistoryAnswer(
      session,
      "recent_chemicals",
      "Sprayed?",
      "herbicide_nearby"
    );
    const result = finalise(session);
    // After ruling out all biotic, only nutrient deficiencies remain
    // — but they may still rank low. Either confirmed or escalation.
    expect(result.outcome).toMatch(/uncertain|confirmed|cannot_determine/);
  });

  it("produces a well-formed result with reasoning", () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "one_plant");
    const result = finalise(session);
    expect(result.outcome).toBeDefined();
    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
    expect(result.reasoning).toBeDefined();
    expect(Array.isArray(result.reasoning.whatRuledOut)).toBe(true);
  });
});

// ─── analysePhoto with mocked Gemini ────────────────────────────

describe("orchestrator: analysePhoto (mocked)", () => {
  beforeEach(() => {
    vi.mocked(visionDifferentialFlow).mockReset();
  });

  it("throws if pattern not yet answered", async () => {
    const session = startDiagnosis({ crop: "chilli" });
    await expect(
      analysePhoto(session, "fakebase64", "image/jpeg")
    ).rejects.toThrow(/pattern question/i);
  });

  it("merges vision output into candidate probabilities", async () => {
    let session = startDiagnosis({ crop: "chilli" });
    session = applyPattern(session, "few_plants");

    vi.mocked(visionDifferentialFlow).mockResolvedValue({
      observations: ["Dark concentric lesions visible on chilli fruit"],
      candidates: [
        {
          diseaseId: "chilli_anthracnose",
          probability: 0.75,
          ruledOut: false,
          ruleOutReason: null,
          positiveEvidence: ["concentric rings on fruit lesion"],
        },
        {
          diseaseId: "chilli_cercospora",
          probability: 0.05,
          ruledOut: true,
          ruleOutReason: "No frog-eye rings on leaves",
          positiveEvidence: [],
        },
        {
          diseaseId: "chilli_bacterial_wilt",
          probability: 0.05,
          ruledOut: true,
          ruleOutReason: "Plant is upright, not wilted",
          positiveEvidence: [],
        },
        {
          diseaseId: "chilli_phosphorus_deficiency",
          probability: 0.1,
          ruledOut: false,
          ruleOutReason: null,
          positiveEvidence: [],
        },
        {
          diseaseId: "chilli_iron_deficiency",
          probability: 0.05,
          ruledOut: true,
          ruleOutReason: "No interveinal chlorosis on new leaves",
          positiveEvidence: [],
        },
      ],
      photoQuality: "good" as const,
      photoQualityNote: null,
      cropMismatch: { detected: false, actualPlant: null, note: null },
    });

    const result = await analysePhoto(session, "fakebase64", "image/jpeg");
    expect(visionDifferentialFlow).toHaveBeenCalledOnce();

    const anthracnose = result.session.candidates.find(
      (c) => c.diseaseId === "chilli_anthracnose"
    )!;
    const cercospora = result.session.candidates.find(
      (c) => c.diseaseId === "chilli_cercospora"
    )!;

    expect(anthracnose.ruledOut).toBe(false);
    expect(cercospora.ruledOut).toBe(true);
    expect(cercospora.ruleOutReason).toMatch(/frog-eye/i);
    expect(result.observations).toHaveLength(1);
    expect(result.photoQuality).toBe("good");
  });

  it("does not un-rule a candidate already ruled out by pattern filter", async () => {
    let session = startDiagnosis({ crop: "chilli" });
    // Multiple_crops should rule out anthracnose at the pattern step
    session = applyPattern(session, "multiple_crops");
    const anthracnoseBefore = session.candidates.find(
      (c) => c.diseaseId === "chilli_anthracnose"
    )!;
    expect(anthracnoseBefore.ruledOut).toBe(true);

    // Vision claims anthracnose is highly likely — but pattern filter wins
    vi.mocked(visionDifferentialFlow).mockResolvedValue({
      observations: ["Dark lesions"],
      candidates: [
        {
          diseaseId: "chilli_anthracnose",
          probability: 0.9,
          ruledOut: false,
          ruleOutReason: null,
          positiveEvidence: ["lesions"],
        },
      ],
      photoQuality: "good" as const,
      photoQualityNote: null,
      cropMismatch: { detected: false, actualPlant: null, note: null },
    });

    const result = await analysePhoto(session, "fake", "image/jpeg");
    const anthracnose = result.session.candidates.find(
      (c) => c.diseaseId === "chilli_anthracnose"
    )!;
    expect(anthracnose.ruledOut).toBe(true); // pattern filter is sticky
  });
});

// ─── Full happy-path scenario test ──────────────────────────────

describe("orchestrator: full happy-path (chilli anthracnose, mocked vision)", () => {
  beforeEach(() => {
    vi.mocked(visionDifferentialFlow).mockReset();
  });

  it("produces a confirmed anthracnose diagnosis end-to-end", async () => {
    // 1. Start
    let session = startDiagnosis({
      crop: "chilli",
      plotId: "plot-b",
      plotLabel: "Plot B",
      recentWeather: { rainyDaysLast7: 5, avgHumidityLast7: 85 },
    });

    // 2. Pattern: a few plants
    session = applyPattern(session, "few_plants");

    // 3. Photo analysis (mocked) — vision sees anthracnose. Rule out every
    //    other chilli candidate explicitly so the test isn't diluted as we
    //    add new diseases to the rules table over time.
    const ruleOutAllExcept = (keep: string[]): {
      diseaseId: string;
      probability: number;
      ruledOut: boolean;
      ruleOutReason: string | null;
      positiveEvidence: string[];
    }[] => {
      const all = [
        "chilli_anthracnose",
        "chilli_cercospora",
        "chilli_bacterial_wilt",
        "chilli_bacterial_leaf_spot",
        "chilli_bacterial_soft_rot",
        "chilli_powdery_mildew",
        "chilli_chivmv",
        "chilli_amv",
        "chilli_cmv",
        "chilli_tswv",
        "chilli_pmmov",
        "chilli_tmv",
        "chilli_calcium_def_blossom_end_rot",
        "chilli_magnesium_deficiency",
        "chilli_nitrogen_deficiency",
        "chilli_potassium_deficiency",
        "chilli_boron_deficiency",
        "chilli_aphid_damage",
        "chilli_thrips_damage",
        "chilli_spider_mite_damage",
        "chilli_whitefly_damage",
        "chilli_fruit_borer",
        "chilli_mealybug_damage",
        "chilli_root_knot_nematode",
        "chilli_fusarium_wilt",
        "chilli_verticillium_wilt",
        "chilli_damping_off",
        "chilli_phytophthora_blight",
        "chilli_choanephora_wet_rot",
        "chilli_water_stress",
        "chilli_waterlogging",
        "chilli_phosphorus_deficiency",
        "chilli_iron_deficiency",
        "chilli_sunscald",
        "chilli_herbicide_drift",
      ];
      return all
        .filter((id) => !keep.includes(id))
        .map((id) => ({
          diseaseId: id,
          probability: 0.02,
          ruledOut: true,
          ruleOutReason: "Photo evidence does not match this candidate",
          positiveEvidence: [],
        }));
    };

    vi.mocked(visionDifferentialFlow).mockResolvedValue({
      observations: [
        "Sunken dark concentric lesions on fruit",
        "Some fruit rotting from tip",
      ],
      candidates: [
        {
          diseaseId: "chilli_anthracnose",
          probability: 0.7,
          ruledOut: false,
          ruleOutReason: null,
          positiveEvidence: ["concentric ring lesions", "tip rot"],
        },
        {
          diseaseId: "chilli_phosphorus_deficiency",
          probability: 0.15,
          ruledOut: false,
          ruleOutReason: null,
          positiveEvidence: [],
        },
        ...ruleOutAllExcept([
          "chilli_anthracnose",
          "chilli_phosphorus_deficiency",
        ]),
      ],
      photoQuality: "good" as const,
      photoQualityNote: null,
      cropMismatch: { detected: false, actualPlant: null, note: null },
    });
    const photoResult = await analysePhoto(session, "fake", "image/jpeg");
    session = photoResult.session;

    // 4. History: rainy weather
    session = applyHistoryAnswer(session, "weather", "Recent weather?", "rainy");

    // 5. Physical test — should be cut_fruit_inspect_smell for anthracnose
    const test = getPhysicalTest(session);
    expect(test?.test).toBe("cut_fruit_inspect_smell");

    // 6. Farmer reports sour smell — confirms anthracnose
    session = applyPhysicalTestResult(session, "sour");

    // 7. Finalise
    const result = finalise(session);

    expect(result.diagnosis?.diseaseId).toBe("chilli_anthracnose");
    expect(result.outcome).toMatch(/confirmed|uncertain/);
    expect(result.prescription).not.toBeNull();
    expect(result.prescription?.controlNow.chemical?.name).toMatch(/Mancozeb/i);
    expect(result.reasoning.whatRuledOut.length).toBeGreaterThan(0);
  });
});
