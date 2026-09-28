export type ExchangeRate = { rate: number; date: string | null; source: string };

const CACHE_DURATION_MS = 6 * 60 * 60 * 1000;
const rateRequests = new Map<string, { expiresAt: number; request: Promise<ExchangeRate> }>();

export function getExchangeRate(from: string, to: string): Promise<ExchangeRate> {
  const key = `${from.toUpperCase()}:${to.toUpperCase()}`;
  const existing = rateRequests.get(key);
  if (existing && existing.expiresAt > Date.now()) return existing.request;

  const request = fetch(`/api/exchange-rates?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`)
    .then(async (response) => {
      const result = await response.json() as { data?: ExchangeRate; error?: string };
      if (!response.ok || !result.data) throw new Error(result.error ?? 'Exchange rate is unavailable.');
      return result.data;
    })
    .catch((error: unknown) => {
      rateRequests.delete(key);
      throw error;
    });
  rateRequests.set(key, { expiresAt: Date.now() + CACHE_DURATION_MS, request });
  return request;
}
