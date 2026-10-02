// Lightweight in-process fixed-window rate limiter used for basic anti-spam protection
// (e.g. chat message bursts). This is intentionally dependency-free: the project has no
// shared cache (Redis/Upstash) configured, so limits are tracked per server process. That is
// sufficient to stop a single abusive client/session from flooding the database and other
// users with messages; for multi-instance production deployments with a shared store, swap
// the in-memory map below for a centralized backend without changing the call sites.
type Bucket = { count: number; windowStart: number };

const buckets = new Map<string, Bucket>();

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  retryAfterMs: number;
};

/**
 * Returns whether `key` is allowed to proceed under a `limit` requests per `windowMs` policy.
 * Each call that is allowed consumes one unit of the budget.
 */
export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  const bucket = buckets.get(key);
  if (!bucket || now - bucket.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: Math.max(0, limit - 1), retryAfterMs: 0 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, retryAfterMs: Math.max(0, windowMs - (now - bucket.windowStart)) };
  }
  bucket.count += 1;
  return { allowed: true, remaining: Math.max(0, limit - bucket.count), retryAfterMs: 0 };
}

/** Removes buckets that have been idle for at least `maxAgeMs` to bound memory growth. */
export function pruneRateLimitBuckets(maxAgeMs: number, now: number = Date.now()) {
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart >= maxAgeMs) buckets.delete(key);
  }
}

/** Test-only helper to reset all tracked buckets between test cases. */
export function resetRateLimitBuckets() {
  buckets.clear();
}
