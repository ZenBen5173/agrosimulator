import { genkit } from "genkit";
import { googleAI } from "@genkit-ai/googleai";

/**
 * Shared Genkit AI instance.
 * All flows and tools import this single instance.
 * Uses GEMINI_API_KEY (same env var as before).
 */
export const ai = genkit({
  plugins: [googleAI({ apiKey: process.env.GEMINI_API_KEY })],
  model: "googleai/gemini-2.0-flash-lite",
});

/** High-accuracy model for disease detection */
export const DISEASE_MODEL = "googleai/gemini-2.0-flash";

/** Default model for all other calls */
export const DEFAULT_MODEL = "googleai/gemini-2.0-flash-lite";
