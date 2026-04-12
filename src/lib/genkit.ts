import { genkit } from "genkit";
import { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall } from "./gemini-budget";

/**
 * Shared Genkit AI instance.
 * Vertex AI only — runs on Cloud Run with service account auth.
 * No Google AI Studio fallback (preserves personal API key quota).
 */
function createAI() {
  const projectId = process.env.GOOGLE_CLOUD_PROJECT_ID;
  if (projectId) {
    const { vertexAI } = require("@genkit-ai/vertexai");
    return genkit({
      plugins: [vertexAI({ projectId, location: "us-central1" })],
      model: "vertexai/gemini-2.5-flash",
    });
  }

  // No project configured — mock fallbacks only
  return genkit({});
}

export const ai = createAI();

/** High-accuracy model for disease detection */
export const DISEASE_MODEL = "vertexai/gemini-2.5-flash";

/** Default model for all other calls */
export const DEFAULT_MODEL = "vertexai/gemini-2.5-flash";

/** Re-export budget utilities for services */
export { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall };
