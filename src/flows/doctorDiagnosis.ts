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
});

export type VisionDifferential = z.infer<typeof VisionDifferentialSchema>;

// ─── System instruction ───────────────────────────────────────

const SYSTEM_INSTRUCTION = `You are a Malaysian plant pathologist trained at MARDI. Your job is to look at photos of crops and produce a DIFFERENTIAL DIAGNOSIS like a real doctor — never a single guess.

ABSOLUTE RULES:
1. You may ONLY consider the candidates provided in the list. Do not invent new diagnoses.
2. For each candidate, set ruledOut=true if the photo evidence clearly contradicts that signature. Provide a SPECIFIC ruleOutReason citing what you observed (or did not observe) — no generic statements.
3. CONFIDENCE CEILINGS — never violate these:
   - Maximum 0.92 from a photo alone, even if the visual match is perfect.
   - Maximum 0.65 if photoQuality is "acceptable", 0.40 if "poor", 0.20 if "unusable".
   - Probabilities of in-play candidates do NOT need to sum to 1 — being uncertain across multiple is GOOD.
4. CONSIDER ABIOTIC CAUSES ALWAYS. Wilting, yellowing, and stunted growth have non-disease causes (water stress, waterlogging, heat, nutrient lock-up, herbicide drift). If any abiotic candidate is in the list, weigh it seriously — DO NOT default to a biotic disease just because diseases dominate the list. The single most common cause of wilting in Malaysian smallholder chilli is under-watering, not bacterial wilt.
5. VIRUSES ARE NEARLY IMPOSSIBLE TO TELL APART BY PHOTO. ChiVMV, AMV, CMV, TSWV and PMMoV all cause mosaic / mottle / yellowing patterns that overlap. Real diagnosis requires lab tests (ELISA / RT-PCR). Therefore:
   - If the photo shows ANY mosaic/mottle/yellowing pattern, mark MULTIPLE viruses as in-play (not ruled out) and split probability across them — do NOT pick a single virus with high confidence.
   - Use the ONE distinguishing visual cue per virus to weight them: ChiVMV = colour BOUND TO veins + narrow/strap leaves; AMV = bright YELLOW or WHITE BLOTCHES between veins; CMV = mosaic + crinkled/fern leaf shape; TSWV = CONCENTRIC RING-SPOTS on leaves or fruit; PMMoV = MILD mottle but DEFORMED FRUIT.
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

  return `You are looking at a photo of a ${crop.toUpperCase()} crop from a Malaysian smallholder farm.

CANDIDATE DISEASES TO CONSIDER (and ONLY these):
${candidateBlocks}

YOUR TASK:
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
    }),
    outputSchema: VisionDifferentialSchema,
  },
  async ({ photoBase64, photoMimeType, crop, candidateIds, pattern }) => {
    const promptText = buildVisionPrompt(crop as CropName, candidateIds);
    const patternHint = patternHintText(pattern as SpreadPattern);

    const { output } = await ai.generate({
      model: DISEASE_MODEL,
      system: SYSTEM_INSTRUCTION,
      prompt: [
        { text: promptText + "\n\nFarmer also reported: " + patternHint },
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

      // Extra clamp: viruses look almost identical on photo. No single virus
      // candidate can exceed 0.55 — that forces the orchestrator to either
      // surface multiple viruses OR drop into "uncertain" and recommend a lab
      // test, instead of confidently picking the wrong one.
      const VIRUS_PHOTO_CEILING = 0.55;
      const VIRAL_IDS = new Set([
        "chilli_chivmv",
        "chilli_amv",
        "chilli_cmv",
        "chilli_tswv",
        "chilli_pmmov",
      ]);

      output.candidates = output.candidates.map((c) => {
        let p = Math.min(c.probability, ceiling);
        if (VIRAL_IDS.has(c.diseaseId) && !c.ruledOut) {
          p = Math.min(p, VIRUS_PHOTO_CEILING);
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
