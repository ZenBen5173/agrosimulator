/**
 * Get the public origin URL from a request.
 * Cloud Run's request.url resolves to 0.0.0.0:8080 internally.
 * This reads the forwarded headers to get the real public URL.
 */
export function getOrigin(request: Request): string {
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const host = request.headers.get("host");
  if (host) return `${proto}://${host}`;
  return new URL(request.url).origin;
}
