import { genkit } from "genkit";
import { vertexAI } from "@genkit-ai/vertexai";
import { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall } from "./gemini-budget";

/**
 * Shared Genkit AI instance.
 * Uses Vertex AI (Google Cloud) instead of AI Studio for higher rate limits.
 */
export const ai = genkit({
  plugins: [vertexAI({
    projectId: process.env.GOOGLE_CLOUD_PROJECT_ID,
    location: "us-central1",
  })],
  model: "vertexai/gemini-2.0-flash-lite",
});

/** High-accuracy model for disease detection */
export const DISEASE_MODEL = "vertexai/gemini-2.0-flash";

/** Default model for all other calls */
export const DEFAULT_MODEL = "vertexai/gemini-2.0-flash-lite";

/** Re-export budget utilities for services */
export { shouldUseRealGemini, getCachedResponse, setCachedResponse, makeCacheKey, logGeminiCall };
