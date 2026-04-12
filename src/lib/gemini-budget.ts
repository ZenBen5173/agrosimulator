/**
 * Gemini API Budget Manager
 *
 * Free tier = 20 requests/day. This module controls which features
 * get real Gemini calls vs mock fallbacks, and caches responses
 * to avoid duplicate calls.
 */

// ── Feature flags: true = use real Gemini, false = always mock ──
export const USE_REAL_GEMINI_FOR: Record<string, boolean> = {
  chat: true,              // AgroBot — judges interact live
  diseaseDetection: true,  // Photo analysis — demo wow moment
  receiptScan: true,       // Document scanning — live demo moment
  documentScan: true,      // AI doc scanner — live demo moment
  riskScoring: false,      // Always mock
  intelligence: false,     // Always mock
  planting: false,         // Always mock
  resources: false,        // Always mock
  farmResearch: false,     // Always mock
  plotLayout: false,       // Always mock
  cronJobs: false,         // Always mock
};

// ── Response cache (2-hour TTL) ──
const cache = new Map<string, { response: unknown; timestamp: number }>();
const CACHE_TTL_MS = 2 * 60 * 60 * 1000; // 2 hours

let callCount = 0;

/**
 * Check if a feature should use real Gemini.
 * Returns false if the feature is disabled OR if Gemini key is missing.
 */
export function shouldUseRealGemini(feature: string): boolean {
  // Vertex AI: check for GCP project. AI Studio fallback: check for API key.
  const hasAI = process.env.GOOGLE_CLOUD_PROJECT_ID || process.env.GEMINI_API_KEY;
  if (!hasAI) return false;
  return USE_REAL_GEMINI_FOR[feature] ?? false;
}

/**
 * Check cache for a previous response to the same prompt.
 * Returns cached response if found and not expired, null otherwise.
 */
export function getCachedResponse(cacheKey: string): unknown | null {
  const entry = cache.get(cacheKey);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    cache.delete(cacheKey);
    return null;
  }
  console.log(`[GEMINI CACHE HIT] key: ${cacheKey.slice(0, 60)}...`);
  return entry.response;
}

/**
 * Store a response in cache.
 */
export function setCachedResponse(cacheKey: string, response: unknown): void {
  cache.set(cacheKey, { response, timestamp: Date.now() });
}

/**
 * Generate a cache key from a prompt string.
 * Uses first 200 chars + length as a simple hash.
 */
export function makeCacheKey(feature: string, prompt: string): string {
  return `${feature}:${prompt.slice(0, 200)}:${prompt.length}`;
}

/**
 * Log a real Gemini call for budget tracking.
 */
export function logGeminiCall(feature: string): void {
  callCount++;
  const estimatedRemaining = Math.max(0, 20 - callCount);
  console.log(`[GEMINI REAL CALL] service: ${feature}, call #${callCount}, remaining budget: ~${estimatedRemaining}`);
}

/**
 * Get current call count (for debugging).
 */
export function getCallCount(): number {
  return callCount;
}
