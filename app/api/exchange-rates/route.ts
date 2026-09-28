import { NextRequest, NextResponse } from 'next/server';
import { isCurrencyCode } from '@/lib/international';

export const revalidate = 21600;
const CACHE_SECONDS = 21600;

export async function GET(request: NextRequest) {
  const from = request.nextUrl.searchParams.get('from')?.toUpperCase() ?? '';
  const to = request.nextUrl.searchParams.get('to')?.toUpperCase() ?? '';
  if (!isCurrencyCode(from) || !isCurrencyCode(to)) {
    return NextResponse.json({ error: 'Use supported ISO 4217 currency codes.' }, { status: 400 });
  }
  if (from === to) return NextResponse.json({ data: { from, to, rate: 1, date: new Date().toISOString().slice(0, 10) } });

  const providers = [
    {
      name: 'open.er-api.com',
      url: `https://open.er-api.com/v6/latest/${encodeURIComponent(from)}`,
      parse: async (response: Response) => {
        const result = await response.json() as { result?: string; time_last_update_utc?: string; rates?: Record<string, number> };
        return {
          rate: result.result === 'success' ? result.rates?.[to] : undefined,
          date: result.time_last_update_utc ?? null,
        };
      },
    },
    {
      name: 'Frankfurter',
      url: `https://api.frankfurter.dev/v1/latest?base=${encodeURIComponent(from)}&symbols=${encodeURIComponent(to)}`,
      parse: async (response: Response) => {
        const result = await response.json() as { date?: string; rates?: Record<string, number> };
        return { rate: result.rates?.[to], date: result.date ?? null };
      },
    },
  ];

  for (const provider of providers) {
    try {
      const response = await fetch(provider.url, { next: { revalidate: CACHE_SECONDS } });
      if (!response.ok) {
        console.error(`${provider.name} exchange-rate provider returned HTTP ${response.status}.`);
        continue;
      }
      const { rate, date } = await provider.parse(response);
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate <= 0) continue;
      return NextResponse.json({
        data: { from, to, rate, date, source: provider.name },
        disclaimer: 'Approximate converted price. Exchange rates may change; listing prices remain in their original currency.',
      }, {
        headers: { 'Cache-Control': `public, s-maxage=${CACHE_SECONDS}, stale-while-revalidate=86400` },
      });
    } catch (error) {
      console.error(`${provider.name} exchange-rate request failed.`, error);
    }
  }

  return NextResponse.json({
    error: `Exchange rates for ${from} to ${to} are temporarily unavailable. The original listing currency is still available.`,
  }, {
    status: 503,
    headers: { 'Cache-Control': 'no-store' },
  });
}