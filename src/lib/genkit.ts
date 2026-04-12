import { genkit } from "genkit";
import { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall } from "./gemini-budget";

/**
 * Shared Genkit AI instance.
 * Uses Google AI Studio (GEMINI_API_KEY) — works on Cloud Run, Vercel, and local.
 * Vertex AI removed: publisher models not accessible on this project.
 */
function createAI() {
  if (process.env.GEMINI_API_KEY) {
    const { googleAI } = require("@genkit-ai/googleai");
    return genkit({
      plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
      model: "googleai/gemini-2.0-flash-lite",
    });
  }

  // No AI configured — will use mock fallbacks
  return genkit({ model: "googleai/gemini-2.0-flash-lite" });
}

export const ai = createAI();

/** High-accuracy model for disease detection */
export const DISEASE_MODEL = "googleai/gemini-2.0-flash";

/** Default model for all other calls */
export const DEFAULT_MODEL = "googleai/gemini-2.0-flash-lite";

/** Re-export budget utilities for services */
export { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall };
