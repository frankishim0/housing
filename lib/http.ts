import { NextResponse } from 'next/server';
import { checkRateLimit } from '@/lib/rate-limit';

export function getClientIp(request: Request) {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  return forwarded || request.headers.get('x-real-ip')?.trim() || 'unknown';
}

/** Returns a 429 response when any of the keys exceeds its budget, otherwise null. */
export function enforceRateLimits(policies: Array<{ key: string; limit: number; windowMs: number }>) {
  for (const policy of policies) {
    const result = checkRateLimit(policy.key, policy.limit, policy.windowMs);
    if (!result.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(result.retryAfterMs / 1000))) } },
      );
    }
  }
  return null;
}

export async function readJsonBody(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
