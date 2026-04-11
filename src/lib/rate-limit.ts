/**
 * Simple in-memory rate limiter.
 * Tracks requests per IP + route. Resets after the window expires.
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const store = new Map<string, RateLimitEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now > entry.resetAt) store.delete(key);
    }
  }, 5 * 60 * 1000);
}

interface RateLimitConfig {
  /** Max requests allowed in the window */
  max: number;
  /** Window duration in seconds */
  windowSeconds: number;
}

/** Default limits per route category */
export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  // AI-powered endpoints (expensive)
  ai: { max: 10, windowSeconds: 60 },
  // Document scanning (very expensive — Gemini Vision)
  scan: { max: 5, windowSeconds: 60 },
  // Chat messages
  chat: { max: 20, windowSeconds: 60 },
  // Regular read endpoints
  read: { max: 60, windowSeconds: 60 },
  // Write endpoints (create/update)
  write: { max: 30, windowSeconds: 60 },
  // Auth endpoints (strict)
  auth: { max: 5, windowSeconds: 300 },
};

/**
 * Check if a request should be rate limited.
 * Returns { allowed: true } or { allowed: false, retryAfter: seconds }.
 */
export function checkRateLimit(
  ip: string,
  category: string
): { allowed: true } | { allowed: false; retryAfter: number } {
  const config = RATE_LIMITS[category] || RATE_LIMITS.read;
  const key = `${ip}:${category}`;
  const now = Date.now();

  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
    return { allowed: true };
  }

  if (entry.count >= config.max) {
    const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
    return { allowed: false, retryAfter };
  }

  entry.count++;
  return { allowed: true };
}

/**
 * Extract client IP from request headers.
 */
export function getClientIP(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  const real = request.headers.get("x-real-ip");
  if (real) return real;
  return "unknown";
}

/**
 * Rate limit a request. Returns a 429 Response if limited, null if allowed.
 * Usage: const limited = rateLimit(request, "ai"); if (limited) return limited;
 */
export function rateLimit(request: Request, category: string): Response | null {
  const ip = getClientIP(request);
  const result = checkRateLimit(ip, category);

  if (!result.allowed) {
    return new Response(
      JSON.stringify({
        error: "Too many requests",
        retryAfter: result.retryAfter,
      }),
      {
        status: 429,
        headers: {
          "Content-Type": "application/json",
          "Retry-After": String(result.retryAfter),
        },
      }
    );
  }

  return null;
}
