/**
 * Resolve the client IP for rate limiting from a trusted hop in the
 * X-Forwarded-For chain.
 *
 * X-Forwarded-For is appended-to by each proxy: the left-most entry is the
 * value the *client* claimed (spoofable), and each trusted proxy appends the
 * address it actually observed. With a single trusted reverse proxy / load
 * balancer in front of the app (the default), the real client address is the
 * right-most entry. `TRUSTED_PROXY_HOPS` lets deployments with more proxies
 * select the correct entry. We never trust the left-most (client-claimed) value.
 */
const TRUSTED_PROXY_HOPS = Math.max(1, Number(process.env.TRUSTED_PROXY_HOPS ?? "1") || 1);

export function getClientIp(request: Request): string {
  const xff = request.headers.get("x-forwarded-for");
  if (!xff) return "unknown";

  const parts = xff
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return "unknown";

  // Real client = the entry the trusted proxy chain appended, counting from the right.
  const idx = parts.length - TRUSTED_PROXY_HOPS;
  return (idx >= 0 ? parts[idx] : parts[0]) || "unknown";
}
