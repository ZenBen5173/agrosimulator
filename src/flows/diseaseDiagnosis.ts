import { z } from "genkit";
import { ai, DISEASE_MODEL } from "@/lib/genkit";

// ─── Schemas ────────────────────────────────────────────────

const AnalysisOutputSchema = z.object({
  confidence: z.number(),
  can_diagnose_now: z.boolean(),
  possible_conditions: z.array(
    z.object({ name: z.string(), probability: z.number() })
  ),
  what_i_need_to_know: z.array(z.string()),
  initial_assessment: z.string(),
});

const DiagnosisOutputSchema = z.object({
  confidence: z.number(),
  diagnosis: z.string().nullable(),
  severity: z.enum(["mild", "moderate", "severe"]).nullable(),
  what_it_is: z.string().nullable(),
  why_this_plot: z.string().nullable(),
  treatment_steps: z.array(z.string()).nullable(),
  watch_for: z.array(z.string()).nullable(),
  neighbouring_plot_risk: z.string().nullable(),
  outcome: z.enum(["confirmed", "uncertain", "cannot_determine"]),
});

export type AnalysisOutput = z.infer<typeof AnalysisOutputSchema>;
export type DiagnosisOutput = z.infer<typeof DiagnosisOutputSchema>;

const SYSTEM_INSTRUCTION =
  "You are a Malaysian agricultural plant pathologist specialising in crops grown in Malaysia including paddy, chilli, kangkung, banana, corn, and sweet potato. You must NEVER guess if you are not confident. You must ONLY diagnose diseases that commonly occur in Malaysian agriculture. Return ONLY valid JSON matching the provided schema. No prose, no markdown outside JSON.";

// ─── Photo Analysis Flow ────────────────────────────────────

export const analysePhotosFlow = ai.defineFlow(
  {
    name: "analysePhotos",
    inputSchema: z.object({
      photos: z.array(
        z.object({ base64: z.string(), mimeType: z.string() })
      ),
      cropName: z.string(),
      plotLabel: z.string(),
    }),
    outputSchema: AnalysisOutputSchema,
  },
  async ({ photos, cropName, plotLabel }) => {
    const photoLabels = [
      "wide shot of the full plant",
      "close-up of the affected area",
      "healthy nearby plant for comparison",
    ];

    const prompt = `Analyse these ${photos.length} photos of a ${cropName} crop from Plot ${plotLabel} on a Malaysian farm.
${photos.map((_, i) => `Photo ${i + 1} is a ${photoLabels[i] || "additional photo"}.`).join("\n")}

Assess the crop's health and identify any signs of disease or stress.

Return JSON exactly:
{
  "confidence": number 0.0-1.0,
  "can_diagnose_now": boolean (true only if confidence >= 0.85),
  "possible_conditions": [{ "name": string, "probability": number }] (max 3),
  "what_i_need_to_know": [string] (follow-up questions if can_diagnose_now is false, max 5),
  "initial_assessment": string (1 sentence, what you observe, NOT a diagnosis)
}`;

    const mediaParts = photos.map((p) => ({
      media: { contentType: p.mimeType, url: `data:${p.mimeType};base64,${p.base64}` },
    }));

    const { output } = await ai.generate({
      model: DISEASE_MODEL,
      system: SYSTEM_INSTRUCTION,
      prompt: [{ text: prompt }, ...mediaParts],
      output: { schema: AnalysisOutputSchema },
      config: { temperature: 0.2 },
    });

    if (output) {
      // Enforce confidence threshold
      output.can_diagnose_now = output.confidence >= 0.85;
      output.confidence = Math.round(output.confidence * 100) / 100;
      return output;
    }

    return {
      confidence: 0,
      can_diagnose_now: false,
      possible_conditions: [],
      what_i_need_to_know: ["Can you describe what you see wrong with the plant?"],
      initial_assessment: "Unable to analyse photos",
    };
  }
);

// ─── Diagnosis with Answers Flow ────────────────────────────

export const diagnoseWithAnswersFlow = ai.defineFlow(
  {
    name: "diagnoseWithAnswers",
    inputSchema: z.object({
      photos: z.array(
        z.object({ base64: z.string(), mimeType: z.string() })
      ),
      cropName: z.string(),
      farmerAnswers: z.array(
        z.object({ question: z.string(), answer: z.string() })
      ),
    }),
    outputSchema: DiagnosisOutputSchema,
  },
  async ({ photos, cropName, farmerAnswers }) => {
    const answersText = farmerAnswers
      .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
      .join("\n\n");

    const prompt = `You previously observed this ${cropName} crop and asked follow-up questions. Here are the farmer's answers:

${answersText}

Now provide your final diagnosis based on the photos and answers.

Return JSON exactly:
{
  "confidence": number 0.0-1.0,
  "diagnosis": string or null,
  "severity": "mild" | "moderate" | "severe" or null,
  "what_it_is": string or null,
  "why_this_plot": string or null,
  "treatment_steps": [string] (3-5 steps) or null,
  "watch_for": [string] (2-3 signs) or null,
  "neighbouring_plot_risk": string or null,
  "outcome": "confirmed" | "uncertain" | "cannot_determine"
}

Outcome rules:
- confirmed: confidence >= 0.85
- uncertain: confidence 0.60-0.84
- cannot_determine: confidence < 0.60 — no diagnosis, no treatment`;

    const mediaParts = photos.map((p) => ({
      media: { contentType: p.mimeType, url: `data:${p.mimeType};base64,${p.base64}` },
    }));

    const { output } = await ai.generate({
      model: DISEASE_MODEL,
      system: SYSTEM_INSTRUCTION,
      prompt: [{ text: prompt }, ...mediaParts],
      output: { schema: DiagnosisOutputSchema },
      config: { temperature: 0.2 },
    });

    if (output) {
      output.confidence = Math.round(output.confidence * 100) / 100;
      // Enforce outcome rules
      if (output.confidence >= 0.85) output.outcome = "confirmed";
      else if (output.confidence >= 0.6) output.outcome = "uncertain";
      else {
        output.outcome = "cannot_determine";
        output.diagnosis = null;
        output.treatment_steps = null;
        output.what_it_is = null;
        output.why_this_plot = null;
        output.watch_for = null;
      }
      return output;
    }

    return {
      confidence: 0,
      diagnosis: null,
      severity: null,
      what_it_is: null,
      why_this_plot: null,
      treatment_steps: null,
      watch_for: null,
      neighbouring_plot_risk: null,
      outcome: "cannot_determine" as const,
    };
  }
);
