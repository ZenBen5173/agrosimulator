/**
 * AgroSim 2.0 — Doctor-Style Diagnosis Genkit Flow
 *
 * This flow does ONE narrow thing: given a plant photo + crop + pattern answer,
 * call Gemini Vision (grounded by the Malaysia rules table) to produce a
 * differential candidate list with explicit ruling-out reasoning.
 *
 * Everything else (pattern filtering, weather priors, history question
 * selection, physical test selection, prescription, escalation) is pure
 * deterministic logic in src/lib/diagnosis/decisionLogic.ts and is tested
 * in src/__tests__/doctorDiagnosis.test.ts.
 *
 * This separation means:
 *   - LLM hallucinations are confined to one well-defined step
 *   - The full diagnostic protocol can be unit-tested without API calls
 *   - The rules table grounds every rule-out the model produces
 *
 * See AGROSIM_2.0.md section 4.1 for the full design.
 */

import { z } from "genkit";
import { ai, DISEASE_MODEL } from "@/lib/genkit";
import { rulesForCrop } from "@/lib/diagnosis/malaysiaRules";
import type { CropName, SpreadPattern } from "@/lib/diagnosis/types";

// ─── Output schema ────────────────────────────────────────────

const VisionDifferentialSchema = z.object({
  /** What the model literally observes — for transparency */
  observations: z.array(z.string()),
  /** Updated probabilities for each candidate disease ID */
  candidates: z.array(
    z.object({
      diseaseId: z.string(),
      probability: z.number().min(0).max(1),
      ruledOut: z.boolean(),
      ruleOutReason: z.string().nullable(),
      positiveEvidence: z.array(z.string()),
    })
  ),
  /** Honest assessment if photo is unusable or insufficient */
  photoQuality: z.enum(["good", "acceptable", "poor", "unusable"]),
  photoQualityNote: z.string().nullable(),
  /**
   * Crop mismatch check. The orchestrator already told us which crop the
   * farmer chose; if the photo clearly shows a DIFFERENT plant species, set
   * detected=true and (best guess) actualPlant. The UI uses this to short-
   * circuit straight to a "wrong crop, try again" result instead of forcing
   * a meaningless differential against the farmer-chosen crop's diseases.
   */
  cropMismatch: z.object({
    detected: z.boolean(),
    actualPlant: z.string().nullable(),
    note: z.string().nullable(),
  }),
});

export type VisionDifferential = z.infer<typeof VisionDifferentialSchema>;

// ─── System instruction ───────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a Malaysian plant pathologist trained at MARDI. Your job is to look at photos of crops and produce a DIFFERENTIAL DIAGNOSIS like a real doctor — never a single guess.

ABSOLUTE RULES:
0. CROP MISMATCH CHECK — BE EXTREMELY CONSERVATIVE. The farmer told us which crop they're inspecting; the photo SHOULD show that crop. Trust the farmer by default — they know what they planted. ONLY flag cropMismatch.detected = true when ALL of these are true:
   - You can confidently identify the plant as a SPECIFIC different species
   - The plant is from a CLEARLY different group than the chosen crop (examples that justify flagging: a monocot grass when farmer chose a dicot like chilli; a tree with woody trunk when farmer chose a herb; a ripe fruit/object that obviously isn't the chosen crop; a weed/ornamental that's not a food crop; a non-plant object like a person, animal, tool, packaging)
   - You are 95%+ sure of the mismatch
   DO NOT flag mismatch for any of these:
   - Diseased / wilted / browning plants — disease changes appearance dramatically and you may not recognise the crop
   - Different growth stages (seedling vs mature, pre-flower vs fruiting)
   - Lookalike vegetables in the same growth habit (chilli vs tomato vs eggplant vs pepper are all Solanaceae and look similar; sunflower vs squash vs cucumber leaves can resemble each other)
   - Photos with only part of the plant in frame
   - Low-quality / blurry / dark photos — use photoQuality: "poor" instead
   - Any case of doubt — when in doubt, set detected = false and let the diagnosis run
   When you DO flag a mismatch (rare), still fill in the candidate probabilities honestly based on what visible disease signs you can see — the orchestrator will surface the warning but keep the differential available for the farmer to override if they're certain about their crop.
1. You may ONLY consider the candidates provided in the list. Do not invent new diagnoses.
2. For each candidate, set ruledOut=true if the photo evidence clearly contradicts that signature. Provide a SPECIFIC ruleOutReason citing what you observed (or did not observe) — no generic statements.
3. CONFIDENCE CEILINGS — never violate these:
   - Maximum 0.92 from a photo alone, even if the visual match is perfect.
   - Maximum 0.65 if photoQuality is "acceptable", 0.40 if "poor", 0.20 if "unusable".
   - Probabilities of in-play candidates do NOT need to sum to 1 — being uncertain across multiple is GOOD.
4. CONSIDER ABIOTIC CAUSES ALWAYS. Wilting, yellowing, and stunted growth have non-disease causes (water stress, waterlogging, heat, nutrient lock-up, herbicide drift). If any abiotic candidate is in the list, weigh it seriously — DO NOT default to a biotic disease just because diseases dominate the list. The single most common cause of wilting in Malaysian smallholder chilli is under-watering, not bacterial wilt.
5a. VASCULAR WILTS LOOK NEARLY IDENTICAL FROM A LEAF PHOTO. Verticillium wilt, Fusarium wilt, and bacterial wilt all cause leaf wilting + browning + plant decline. Real plant pathologists separate them with a STEM-CUT TEST (vascular colour + bacterial-ooze test), not by leaves alone. Therefore:
   - When you see ANY wilt + leaf yellowing/browning pattern, mark Verticillium wilt, Fusarium wilt, AND bacterial wilt as in-play (NOT ruled out) with similar mid-range probabilities (0.25-0.45 each). Do NOT pick one with high confidence from leaf evidence alone.
   - ONLY rule out a wilt candidate if a non-wilt feature contradicts it (e.g. plant is upright with fresh fruit lesions → not a vascular wilt; bottom-up old-leaf yellowing → less likely bacterial wilt which kills fast).
   - Use what IS visible in the leaf photo to weight slightly: one-sided / asymmetric wilt + interveinal yellow with V-shaped patches → favour Verticillium; symmetric bottom-up yellowing with clean leaf drop → favour Fusarium; whole-plant sudden collapse with leaves still green → favour bacterial wilt.
   - The stem-cut physical test will resolve the differential — let it.
5b. VIRUSES ARE NEARLY IMPOSSIBLE TO TELL APART BY PHOTO. ChiVMV, AMV, CMV, TSWV, PMMoV and TMV all cause mosaic / mottle / yellowing patterns that overlap. Real diagnosis requires lab tests (ELISA / RT-PCR). Therefore:
   - If the photo shows ANY mosaic/mottle/yellowing pattern, mark MULTIPLE viruses as in-play (not ruled out) and split probability across them — do NOT pick a single virus with high confidence.
   - Use the ONE distinguishing visual cue per virus to weight them: ChiVMV = colour BOUND TO veins + narrow/strap leaves; AMV = bright YELLOW or WHITE BLOTCHES between veins; CMV = mosaic + crinkled/fern leaf shape; TSWV = CONCENTRIC RING-SPOTS on leaves or fruit; PMMoV = MILD mottle but DEFORMED FRUIT; TMV = pronounced light/dark mosaic + leaf distortion but NORMAL fruit + tobacco-contact history.
   - If you see yellow/white patches that do NOT follow vein lines, ChiVMV is LESS likely than AMV — say so explicitly in the rule-out reason.
   - Cap any single virus at 0.55 unless its specific signature feature is clearly visible. Always recommend lab confirmation when virus is suspected.
6. If photo is poor quality (blurry, dark, wrong subject, just black or just white), set photoQuality to "poor" or "unusable" and keep ALL probabilities below 0.20.
7. Output JSON matching the schema exactly — no prose, no markdown.

You diagnose the way a Malaysian extension officer would: by ruling things out with evidence, weighing abiotic causes equally, and naming what remains. The farmer will spray harmful chemicals based on what you say. If you're not sure, say so with a low probability.`;

// ─── Helper: build the grounded prompt ─────────────────────────

function buildVisionPrompt(
  crop: CropName,
  candidateIds: string[]
): string {
  const allRulesForCrop = rulesForCrop(crop);
  const candidates = allRulesForCrop.filter((r) => candidateIds.includes(r.id));

  const candidateBlocks = candidates
    .map((r) => {
      const positives = r.signsPositive.map((s) => `      - ${s}`).join("\n");
      const ruleOuts = r.ruleOutClauses
        .map((c) => `      - if absent: "${c.ifAbsent}" → "${c.thereforeNot}"`)
        .join("\n");
      return `  ${r.id} (${r.name} — ${r.scientificName}, ${r.category}):
    Positive signs (what you'd see if it IS this):
${positives}
    Rule-out clauses (if you DON'T see these, this disease is unlikely):
${ruleOuts}`;
    })
    .join("\n\n");

  return `The farmer told us they're inspecting their ${crop.toUpperCase()} crop. The photo SHOULD show a ${crop} plant from a Malaysian smallholder farm.

STEP 0 — CROP MISMATCH CHECK (BE CONSERVATIVE).
Default assumption: the farmer knows their crop. The photo SHOULD show ${crop}. Only flag mismatch when overwhelming evidence says otherwise.
- If the plant could plausibly be ${crop} (any growth stage, any disease state, even if you're unsure) → set cropMismatch.detected = false and continue.
- ONLY set cropMismatch.detected = true when the photo shows something OBVIOUSLY non-${crop}: a tree, a grass / monocot, a totally different ripe fruit, a non-plant object, a clearly different crop the farmer would never confuse. In that case fill in actualPlant + note, but STILL provide candidate probabilities (the farmer may override if they're certain).
- Diseased ${crop} plants can look unfamiliar — wilting, browning, leaf curling, defoliation all change appearance. Do NOT mistake disease symptoms for "wrong species".

CANDIDATE DISEASES TO CONSIDER (and ONLY these — only relevant if STEP 0 passed):
${candidateBlocks}

REMAINING STEPS (skip if cropMismatch.detected = true):
1. Describe what you literally observe in the photo (3-5 short observations).
2. For each candidate disease ID above, output:
   - probability (0.0 to 1.0)
   - ruledOut (true/false): set true if the photo CLEARLY contradicts this disease's signature
   - ruleOutReason (only when ruledOut=true): cite the specific photo evidence — "no spindle-shaped lesions visible" or "leaves yellowing in old growth, not new growth as iron deficiency would show"
   - positiveEvidence: list of what you see in the photo that supports this disease (empty array if ruledOut)
3. Assess photoQuality: good / acceptable / poor / unusable.

Probabilities of in-play (not ruled out) candidates do not need to sum to 1 — the orchestrator will normalise. Just give your honest read of each.

If the photo doesn't clearly show the diseased part, mark photoQuality as "poor" or "unusable" and keep probabilities low.

Output ONLY the JSON object matching the schema.`;
}

// ─── The flow ─────────────────────────────────────────────────

export const visionDifferentialFlow = ai.defineFlow(
  {
    name: "visionDifferential",
    inputSchema: z.object({
      photoBase64: z.string(),
      photoMimeType: z.string(),
      crop: z.enum([
        "paddy",
        "chilli",
        "kangkung",
        "banana",
        "corn",
        "sweet_potato",
      ]),
      candidateIds: z.array(z.string()),
      pattern: z.enum([
        "one_plant",
        "few_plants",
        "whole_plot",
        "multiple_crops",
      ]),
      // Optional — set by Layer 2 only. Tells the model that this photo is
      // a specific targeted close-up (e.g. stem cross-section) and to
      // interpret it accordingly. Layer 1 leaves this undefined.
      extraPhotoKind: z
        .enum([
          "stem_cross_section",
          "stem_in_water",
          "new_growth_close_up",
          "fruit_close_up",
          "fruit_cut_open",
          "leaf_underside",
          "root_close_up",
          "whole_plant_pattern",
          "side_by_side_healthy",
        ])
        .optional(),
    }),
    outputSchema: VisionDifferentialSchema,
  },
  async ({ photoBase64, photoMimeType, crop, candidateIds, pattern, extraPhotoKind }) => {
    const promptText = buildVisionPrompt(crop as CropName, candidateIds);
    const patternHint = patternHintText(pattern as SpreadPattern);
    const layerTwoHint = extraPhotoKind
      ? `\n\nLAYER 2 CONTEXT: This is a targeted close-up photo of kind "${extraPhotoKind}" (${extraPhotoKindHint(extraPhotoKind)}). The farmer already uploaded a whole-plant photo earlier; this photo is meant to discriminate between candidates that look the same in a wide shot. Focus your observations + probabilities on what THIS specific view reveals. Crop-mismatch detection is unnecessary here (we already know the crop).`
      : "";

    const { output } = await ai.generate({
      model: DISEASE_MODEL,
      system: SYSTEM_INSTRUCTION,
      prompt: [
        {
          text:
            promptText +
            "\n\nFarmer also reported: " +
            patternHint +
            layerTwoHint,
        },
        {
          media: {
            contentType: photoMimeType,
            url: `data:${photoMimeType};base64,${photoBase64}`,
          },
        },
      ],
      output: { schema: VisionDifferentialSchema },
      config: { temperature: 0.2 },
    });

    if (output) {
      // Belt-and-braces: clamp confidence per the system-prompt ceilings so
      // even if the model ignores the rules, the farmer never sees 100%.
      const ceiling =
        output.photoQuality === "good"
          ? 0.92
          : output.photoQuality === "acceptable"
          ? 0.65
          : output.photoQuality === "poor"
          ? 0.4
          : 0.2; // unusable

      // Extra clamps: viruses + vascular wilts look almost identical on a
      // leaf photo. Cap each so we never confidently pick the "wrong one"
      // from photo alone — the stem-cut test (for wilts) or lab test (for
      // viruses) is what actually resolves the differential.
      const VIRUS_PHOTO_CEILING = 0.55;
      const VASCULAR_WILT_PHOTO_CEILING = 0.55;
      const VIRAL_IDS = new Set([
        "chilli_chivmv",
        "chilli_amv",
        "chilli_cmv",
        "chilli_tswv",
        "chilli_pmmov",
        "chilli_tmv",
      ]);
      const VASCULAR_WILT_IDS = new Set([
        "chilli_verticillium_wilt",
        "chilli_fusarium_wilt",
        "chilli_bacterial_wilt",
      ]);

      output.candidates = output.candidates.map((c) => {
        let p = Math.min(c.probability, ceiling);
        if (VIRAL_IDS.has(c.diseaseId) && !c.ruledOut) {
          p = Math.min(p, VIRUS_PHOTO_CEILING);
        }
        if (VASCULAR_WILT_IDS.has(c.diseaseId) && !c.ruledOut) {
          p = Math.min(p, VASCULAR_WILT_PHOTO_CEILING);
        }
        return { ...c, probability: p };
      });
      return output;
    }

    return {
      observations: ["Unable to analyse photo — model returned no output."],
      candidates: candidateIds.map((id) => ({
        diseaseId: id,
        probability: 0,
        ruledOut: false,
        ruleOutReason: null,
        positiveEvidence: [],
      })),
      photoQuality: "unusable" as const,
      photoQualityNote: "Model did not return a structured response.",
      cropMismatch: { detected: false, actualPlant: null, note: null },
    };
  }
);

function patternHintText(pattern: SpreadPattern): string {
  switch (pattern) {
    case "one_plant":
      return "Problem affects ONE plant only. Most likely localised biotic cause or random damage.";
    case "few_plants":
      return "Problem affects A FEW plants in a row. Consistent with a spreading biotic disease in early stages.";
    case "whole_plot":
      return "Problem affects the WHOLE PLOT uniformly. Could be biotic (advanced) or abiotic (drainage/water/spray).";
    case "multiple_crops":
      return "Problem affects DIFFERENT CROP SPECIES too. Strongly suggests abiotic cause (drainage, herbicide drift, water quality, weather damage). Biotic diseases are usually host-specific.";
  }
}

/**
 * One-line interpretive hint for each Layer-2 photo kind, fed into the
 * model prompt so it knows what discriminating signs to look for in this
 * specific close-up. Keeps the model focused on the diagnostic question
 * the photo was taken to answer.
 */
function extraPhotoKindHint(kind: string): string {
  switch (kind) {
    case "stem_cross_section":
      return "look at the vascular ring colour: dark chocolate-brown concentrated at base = Fusarium; tan/grey-brown streak running higher = Verticillium; brown ring = consistent with bacterial wilt (needs the ooze test to confirm)";
    case "stem_in_water":
      return "look for milky/cloudy bacterial stream flowing out of the cut stem within 3 minutes — that's diagnostic of bacterial wilt (Ralstonia)";
    case "new_growth_close_up":
      return "look at the youngest leaves: vein-bound colour change (ChiVMV), bright yellow blotches between veins (AMV), concentric ring-spots (TSWV), strongly crinkled / fern-like (CMV), pronounced light-dark mosaic (TMV)";
    case "fruit_close_up":
      return "look for fruit deformation (PMMoV / severe CMV), surface ring-spots (TSWV), or normal-looking fruit (TMV / ChiVMV) — fruit pattern is a key virus differentiator";
    case "fruit_cut_open":
      return "look inside the cut fruit: dark concentric internal rings = anthracnose; black hair-like sporangia growing out = Choanephora wet rot; cream slimy interior with foul smell = bacterial soft rot";
    case "leaf_underside":
      return "look at the leaf underside for: webbing + tiny mites (spider mite); aphid colonies + cornicles; tiny flat oval scales (whitefly nymphs); silvery feeding scars + black flecks (thrips)";
    case "root_close_up":
      return "look at the roots for: irregular round galls/swellings (root-knot nematode); brown mushy rotted roots (Phytophthora); discoloured but firm root system (Fusarium)";
    case "whole_plant_pattern":
      return "look at the whole plant for asymmetric one-sided wilt (Verticillium) vs symmetric bottom-up collapse (Fusarium) vs sudden whole-plant droop with leaves still green (bacterial wilt)";
    case "side_by_side_healthy":
      return "compare colour, leaf size, leaf shape against the healthy reference — interveinal yellowing, scorched margins, or distortion become much clearer in side-by-side";
    default:
      return "interpret based on what's visible in the close-up";
  }
}
