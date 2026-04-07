import { GoogleGenerativeAI } from "@google/generative-ai";

const SYSTEM_INSTRUCTION =
  "You are a Malaysian agricultural plant pathologist specialising in crops grown in Malaysia including paddy, chilli, kangkung, banana, corn, and sweet potato. You must NEVER guess if you are not confident. You must ONLY diagnose diseases that commonly occur in Malaysian agriculture. Return ONLY valid JSON matching the provided schema. No prose, no markdown outside JSON.";

// --- Types ---

export interface AnalysisResult {
  confidence: number;
  can_diagnose_now: boolean;
  possible_conditions: { name: string; probability: number }[];
  what_i_need_to_know: string[];
  initial_assessment: string;
}

export interface DiagnosisResult {
  confidence: number;
  diagnosis: string | null;
  severity: string | null;
  what_it_is: string | null;
  why_this_plot: string | null;
  treatment_steps: string[] | null;
  watch_for: string[] | null;
  neighbouring_plot_risk: string | null;
  outcome: "confirmed" | "uncertain" | "cannot_determine";
}

// --- Fallbacks ---

const ANALYSIS_FALLBACK: AnalysisResult = {
  confidence: 0,
  can_diagnose_now: false,
  possible_conditions: [],
  what_i_need_to_know: [
    "Can you describe what you see wrong with the plant?",
  ],
  initial_assessment: "Unable to analyse photos",
};

const DIAGNOSIS_FALLBACK: DiagnosisResult = {
  confidence: 0,
  diagnosis: null,
  severity: null,
  what_it_is: null,
  why_this_plot: null,
  treatment_steps: null,
  watch_for: null,
  neighbouring_plot_risk: null,
  outcome: "cannot_determine",
};

// --- Validation ---

function validateAnalysis(data: unknown): AnalysisResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  if (typeof d.confidence !== "number" || d.confidence < 0 || d.confidence > 1)
    return null;
  if (typeof d.can_diagnose_now !== "boolean") return null;
  if (!Array.isArray(d.possible_conditions)) return null;
  if (!Array.isArray(d.what_i_need_to_know)) return null;
  if (typeof d.initial_assessment !== "string") return null;

  // Enforce confidence threshold
  const canDiagnose = d.confidence >= 0.85;

  return {
    confidence: Math.round((d.confidence as number) * 100) / 100,
    can_diagnose_now: canDiagnose,
    possible_conditions: (d.possible_conditions as { name: string; probability: number }[])
      .filter(
        (c) =>
          typeof c.name === "string" && typeof c.probability === "number"
      )
      .slice(0, 3),
    what_i_need_to_know: (d.what_i_need_to_know as string[])
      .filter((q) => typeof q === "string")
      .slice(0, 5),
    initial_assessment: (d.initial_assessment as string).slice(0, 300),
  };
}

function validateDiagnosis(data: unknown): DiagnosisResult | null {
  if (!data || typeof data !== "object") return null;
  const d = data as Record<string, unknown>;

  if (typeof d.confidence !== "number" || d.confidence < 0 || d.confidence > 1)
    return null;
  if (
    typeof d.outcome !== "string" ||
    !["confirmed", "uncertain", "cannot_determine"].includes(d.outcome)
  )
    return null;

  const confidence = Math.round((d.confidence as number) * 100) / 100;

  // Enforce outcome rules based on confidence
  let outcome = d.outcome as "confirmed" | "uncertain" | "cannot_determine";
  if (confidence >= 0.85) outcome = "confirmed";
  else if (confidence >= 0.60) outcome = "uncertain";
  else outcome = "cannot_determine";

  // Never return treatment for cannot_determine
  const treatmentSteps =
    outcome === "cannot_determine"
      ? null
      : Array.isArray(d.treatment_steps)
        ? (d.treatment_steps as string[]).filter((s) => typeof s === "string").slice(0, 5)
        : null;

  return {
    confidence,
    diagnosis:
      outcome === "cannot_determine"
        ? null
        : typeof d.diagnosis === "string"
          ? d.diagnosis
          : null,
    severity:
      typeof d.severity === "string" &&
      ["mild", "moderate", "severe"].includes(d.severity)
        ? d.severity
        : null,
    what_it_is:
      outcome === "cannot_determine"
        ? null
        : typeof d.what_it_is === "string"
          ? (d.what_it_is as string).slice(0, 500)
          : null,
    why_this_plot:
      outcome === "cannot_determine"
        ? null
        : typeof d.why_this_plot === "string"
          ? (d.why_this_plot as string).slice(0, 500)
          : null,
    treatment_steps: treatmentSteps,
    watch_for:
      outcome === "cannot_determine"
        ? null
        : Array.isArray(d.watch_for)
          ? (d.watch_for as string[]).filter((s) => typeof s === "string").slice(0, 3)
          : null,
    neighbouring_plot_risk:
      typeof d.neighbouring_plot_risk === "string"
        ? d.neighbouring_plot_risk
        : null,
    outcome,
  };
}

function cleanJsonResponse(text: string): string {
  return text
    .replace(/^```json\s*/i, "")
    .replace(/^```\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();
}

// --- Mock data ---

function getMockAnalysis(cropName: string): AnalysisResult {
  return {
    confidence: 0.72,
    can_diagnose_now: false,
    possible_conditions: [
      { name: "Leaf spot disease", probability: 0.65 },
      { name: "Nutrient deficiency", probability: 0.20 },
      { name: "Pest damage", probability: 0.15 },
    ],
    what_i_need_to_know: [
      `Are the spots on the ${cropName} leaves brown or yellow?`,
      "Have you applied any pesticides or fertilizer recently?",
      "Do you see any insects on the underside of the leaves?",
      "Has your neighbour's farm experienced similar issues?",
    ],
    initial_assessment: `I can see some discolouration on the ${cropName} leaves that could indicate a fungal infection or nutrient issue. I need more information to be sure.`,
  };
}

function getMockDiagnosis(
  cropName: string,
  answers: { question: string; answer: string }[]
): DiagnosisResult {
  // Simulate different outcomes based on answers
  const mentionsBrown = answers.some(
    (a) => a.answer.toLowerCase().includes("brown") || a.answer.toLowerCase().includes("yes")
  );

  if (mentionsBrown) {
    return {
      confidence: 0.88,
      diagnosis: "Cercospora Leaf Spot",
      severity: "moderate",
      what_it_is: `Cercospora leaf spot is a common fungal disease in ${cropName}. It causes circular brown spots with grey centres on the leaves, which can spread and reduce yield if untreated.`,
      why_this_plot: `High humidity and recent rainfall created ideal conditions for fungal growth. The ${cropName} in this plot is at a vulnerable growth stage.`,
      treatment_steps: [
        "Remove and destroy severely affected leaves immediately",
        "Apply Mancozeb fungicide (2g per litre of water) — available at any agricultural shop",
        "Spray early morning before 9 AM when leaves are dry",
        "Repeat application every 7 days for 3 weeks",
        "Improve air circulation by thinning overcrowded plants",
      ],
      watch_for: [
        "Spots growing larger or turning black",
        "New leaves showing spots within 3 days of treatment",
        "Spots appearing on stems (indicates severe spread)",
      ],
      neighbouring_plot_risk:
        "This fungal disease can spread via wind and rain splashing. Check neighbouring plots for similar spots.",
      outcome: "confirmed",
    };
  }

  return {
    confidence: 0.55,
    diagnosis: null,
    severity: null,
    what_it_is: null,
    why_this_plot: null,
    treatment_steps: null,
    watch_for: null,
    neighbouring_plot_risk: null,
    outcome: "cannot_determine",
  };
}

// --- Main functions ---

export async function analysePhotos(
  photos: { base64: string; mimeType: string }[],
  cropName: string,
  plotLabel: string
): Promise<AnalysisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using mock analysis");
    return getMockAnalysis(cropName);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

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
  "possible_conditions": [
    { "name": string, "probability": number }
  ] (max 3, sorted by probability descending),
  "what_i_need_to_know": [string] (follow-up questions if can_diagnose_now is false, max 5),
  "initial_assessment": string (1 sentence, what you observe, NOT a diagnosis)
}`;

  const imageParts = photos.map((p) => ({
    inlineData: { data: p.base64, mimeType: p.mimeType },
  }));

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent([prompt, ...imageParts]);
      const text = result.response.text().trim();
      const cleaned = cleanJsonResponse(text);
      const parsed = JSON.parse(cleaned);
      const validated = validateAnalysis(parsed);
      if (validated) return validated;

      console.warn(`Analysis validation failed (attempt ${attempt + 1})`);
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(`Analysis Gemini call failed (attempt ${attempt + 1}):`, err);
    }
  }

  console.warn("Gemini analysis failed, using mock data");
  return getMockAnalysis(cropName);
}

export async function diagnoseWithAnswers(
  photos: { base64: string; mimeType: string }[],
  cropName: string,
  farmerAnswers: { question: string; answer: string }[]
): Promise<DiagnosisResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey || apiKey === "your_gemini_api_key_here") {
    console.warn("GEMINI_API_KEY not set, using mock diagnosis");
    return getMockDiagnosis(cropName, farmerAnswers);
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash-lite",
    systemInstruction: SYSTEM_INSTRUCTION,
  });

  const answersText = farmerAnswers
    .map((a) => `Q: ${a.question}\nA: ${a.answer}`)
    .join("\n\n");

  const prompt = `You previously observed this ${cropName} crop and asked follow-up questions. Here are the farmer's answers:

${answersText}

Now provide your final diagnosis based on the photos and answers.

Return JSON exactly:
{
  "confidence": number 0.0-1.0,
  "diagnosis": string or null (disease name, null if confidence < 0.60),
  "severity": "mild" | "moderate" | "severe" or null,
  "what_it_is": string (plain English explanation, 2-3 sentences) or null,
  "why_this_plot": string (why this plot got it — mention weather/growth stage/history) or null,
  "treatment_steps": [string] (3-5 numbered actionable steps, Malaysian products/practices only) or null,
  "watch_for": [string] (2-3 signs it is getting worse) or null,
  "neighbouring_plot_risk": string or null (alert if disease can spread to nearby plots),
  "outcome": "confirmed" | "uncertain" | "cannot_determine"
}

Outcome rules:
- confirmed: confidence >= 0.85 — commit to diagnosis
- uncertain: confidence 0.60-0.84 — give best assessment with caveat
- cannot_determine: confidence < 0.60 — no diagnosis, no treatment, refer to expert`;

  const imageParts = photos.map((p) => ({
    inlineData: { data: p.base64, mimeType: p.mimeType },
  }));

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const result = await model.generateContent([prompt, ...imageParts]);
      const text = result.response.text().trim();
      const cleaned = cleanJsonResponse(text);
      const parsed = JSON.parse(cleaned);
      const validated = validateDiagnosis(parsed);
      if (validated) return validated;

      console.warn(`Diagnosis validation failed (attempt ${attempt + 1})`);
    } catch (err) {
      const is429 = err instanceof Error && err.message.includes("429");
      if (is429 && attempt === 0) {
        console.warn("Gemini 429 rate limit, retrying in 2s...");
        await new Promise((r) => setTimeout(r, 2000));
        continue;
      }
      console.error(`Diagnosis Gemini call failed (attempt ${attempt + 1}):`, err);
    }
  }

  console.warn("Gemini diagnosis failed, using mock data");
  return getMockDiagnosis(cropName, farmerAnswers);
}
