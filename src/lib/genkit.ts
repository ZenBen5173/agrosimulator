import { genkit } from "genkit";
import { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall } from "./gemini-budget";

/**
 * Shared Genkit AI instance.
 * Uses Vertex AI on Cloud Run (GCP auth available).
 * Falls back to Google AI Studio on Vercel (GEMINI_API_KEY).
 */
function createAI() {
  // Prefer Vertex AI if GCP project is configured and we're on Cloud Run
  if (process.env.GOOGLE_CLOUD_PROJECT_ID && process.env.K_SERVICE) {
    // K_SERVICE is set by Cloud Run — indicates we're running on GCP
    const { vertexAI } = require("@genkit-ai/vertexai");
    return genkit({
      plugins: [vertexAI({
        projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
        location: "us-central1",
      })],
      model: "vertexai/gemini-2.0-flash",
    });
  }

  // Fallback: AI Studio via API key (works on Vercel + local dev)
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
export const DISEASE_MODEL = process.env.K_SERVICE
  ? "vertexai/gemini-2.0-flash"
  : "googleai/gemini-2.0-flash";

/** Default model for all other calls */
export const DEFAULT_MODEL = process.env.K_SERVICE
  ? "vertexai/gemini-2.0-flash"
  : "googleai/gemini-2.0-flash-lite";

/** Re-export budget utilities for services */
export { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall };
