import assert from 'node:assert/strict';
import { enforceRateLimits, getClientIp, readJsonBody } from '../lib/http';
import { resetRateLimitBuckets } from '../lib/rate-limit';

async function run() {
  resetRateLimitBuckets();
  assert.equal(getClientIp(new Request('http://x', { headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' } })), '1.2.3.4');
  assert.equal(getClientIp(new Request('http://x')), 'unknown');

  const policy = [{ key: 'test:key', limit: 2, windowMs: 60_000 }];
  assert.equal(enforceRateLimits(policy), null);
  assert.equal(enforceRateLimits(policy), null);
  const blocked = enforceRateLimits(policy);
  assert.equal(blocked?.status, 429);
  assert.ok(Number(blocked?.headers.get('Retry-After')) >= 1);

  const bad = new Request('http://x', { method: 'POST', body: '{not json' });
  assert.equal(await readJsonBody(bad), null);
  resetRateLimitBuckets();
  console.log('http hardening tests passed');
}

run().catch((error) => {
  console.error(error);
  process.exit(1);
});
