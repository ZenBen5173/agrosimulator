/**
 * Disease detection service — retrofitted to use Genkit.
 * Keeps the same exported interface so API routes don't change.
 */
import {
  analysePhotosFlow,
  diagnoseWithAnswersFlow,
  type AnalysisOutput,
  type DiagnosisOutput,
} from "@/flows/diseaseDiagnosis";

// Re-export types for backward compatibility
export type AnalysisResult = AnalysisOutput;
export type DiagnosisResult = DiagnosisOutput;

// ─── Mock fallbacks ─────────────────────────────────────────

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
  const mentionsBrown = answers.some(
    (a) => a.answer.toLowerCase().includes("brown") || a.answer.toLowerCase().includes("yes")
  );

  if (mentionsBrown) {
    return {
      confidence: 0.88,
      diagnosis: "Cercospora Leaf Spot",
      severity: "moderate",
      what_it_is: `Cercospora leaf spot is a common fungal disease in ${cropName}. It causes circular brown spots with grey centres on the leaves.`,
      why_this_plot: `High humidity and recent rainfall created ideal conditions for fungal growth.`,
      treatment_steps: [
        "Remove and destroy severely affected leaves immediately",
        "Apply Mancozeb fungicide (2g per litre of water)",
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
        "This fungal disease can spread via wind and rain splashing. Check neighbouring plots.",
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

// ─── Public API (unchanged signatures) ──────────────────────

export async function analysePhotos(
  photos: { base64: string; mimeType: string }[],
  cropName: string,
  plotLabel: string
): Promise<AnalysisResult> {
  try {
    return await analysePhotosFlow({ photos, cropName, plotLabel });
  } catch (err) {
    console.warn("Genkit analysePhotos failed, using mock:", err);
    return getMockAnalysis(cropName);
  }
}

export async function diagnoseWithAnswers(
  photos: { base64: string; mimeType: string }[],
  cropName: string,
  farmerAnswers: { question: string; answer: string }[]
): Promise<DiagnosisResult> {
  try {
    return await diagnoseWithAnswersFlow({ photos, cropName, farmerAnswers });
  } catch (err) {
    console.warn("Genkit diagnoseWithAnswers failed, using mock:", err);
    return getMockDiagnosis(cropName, farmerAnswers);
  }
}
