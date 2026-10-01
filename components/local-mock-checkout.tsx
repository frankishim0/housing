'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/international';

interface CheckoutData {
  reference: string;
  amount: string;
  currency: string;
  status: string;
  purchaseName: string;
  transaction: null | {
    status: string;
    amount: string;
    platformCommission: string;
    buyerPlatformFee: string;
    totalBuyerDue: string;
    sellerAmount: string;
    finalPayout: string;
    commissionRate: string;
    commissionPayer: string;
    currencyCode: string;
    transactionType: string;
  };
}

interface CompletionResult {
  webhookVerified: boolean;
  duplicate: boolean;
  outcome: string;
  simulatedOutcome: 'success' | 'failed' | 'abandoned';
  paymentStatus: string;
  transactionStatus: string | null;
  transaction: null | {
    amount: string;
    platformCommission: string;
    buyerPlatformFee: string;
    totalBuyerDue: string;
    sellerAmount: string;
    finalPayout: string;
    currencyCode: string;
  };
}

export function LocalMockCheckout() {
  const router = useRouter();
  const [checkout, setCheckout] = useState<CheckoutData | null>(null);
  const [result, setResult] = useState<CompletionResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    const reference = new URLSearchParams(window.location.search).get('reference') ?? '';
    const controller = new AbortController();
    void fetch(`/api/payments/mock/checkout?reference=${encodeURIComponent(reference)}`, {
      signal: controller.signal,
    }).then(async (response) => {
      const payload = await response.json();
      if (response.status === 401) {
        router.push('/auth');
        return;
      }
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to load this local test payment.');
      setCheckout(payload.data as CheckoutData);
    }).catch((loadError: unknown) => {
      if (!controller.signal.aborted) {
        setError(loadError instanceof Error ? loadError.message : 'Unable to load this local test payment.');
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [router]);

  async function simulate(outcome: 'success' | 'failed' | 'abandoned', replay = false) {
    if (!checkout) return;
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/payments/mock/complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reference: checkout.reference, outcome, replay }),
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(typeof payload.error === 'string' ? payload.error : 'Unable to complete the local test payment.');
      setResult(payload.data as CompletionResult);
    } catch (paymentError) {
      setError(paymentError instanceof Error ? paymentError.message : 'Unable to complete the local test payment.');
    } finally {
      setPending(false);
    }
  }

  const currency = checkout?.transaction?.currencyCode ?? checkout?.currency ?? 'NGN';
  const final = result?.transactionStatus ?? checkout?.transaction?.status;

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <section className="rounded-3xl border border-amber-300 bg-white p-6 shadow-sm sm:p-8">
        <p className="inline-flex rounded-full bg-amber-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-amber-900">
          Local sandbox · no real payment
        </p>
        <h1 className="mt-4 text-2xl font-bold text-slate-950">Simulated checkout</h1>
        <p className="mt-2 text-sm text-slate-600">
          Choose a test outcome. The server uses the stored quote, signs a local webhook, verifies it, and records the result through the same settlement path. This cannot run in production or against a remote database.
        </p>

        {loading && <p className="mt-6 text-sm text-slate-600">Loading server-priced checkout…</p>}
        {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-800">{error}</p>}

        {checkout && !loading && (
          <>
            <div className="mt-6 rounded-2xl bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">{checkout.purchaseName}</p>
              <p className="mt-1 break-all text-xs text-slate-500">Reference: {checkout.reference}</p>
              {checkout.transaction && (
                <dl className="mt-4 space-y-2 text-sm">
                  <div className="flex justify-between gap-3"><dt>Property amount</dt><dd>{formatCurrency(Number(checkout.transaction.amount), currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Commission rate</dt><dd>{checkout.transaction.commissionRate}% · {checkout.transaction.commissionPayer.toLowerCase()}-paid</dd></div>
                  <div className="flex justify-between gap-3"><dt>Platform commission</dt><dd>{formatCurrency(Number(checkout.transaction.platformCommission), currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Buyer platform fee</dt><dd>{formatCurrency(Number(checkout.transaction.buyerPlatformFee), currency)}</dd></div>
                  <div className="flex justify-between gap-3 border-t border-slate-200 pt-2 font-bold"><dt>Buyer total</dt><dd>{formatCurrency(Number(checkout.transaction.totalBuyerDue), currency)}</dd></div>
                  <div className="flex justify-between gap-3"><dt>Seller amount / final payout</dt><dd>{formatCurrency(Number(checkout.transaction.sellerAmount), currency)} / {formatCurrency(Number(checkout.transaction.finalPayout), currency)}</dd></div>
                </dl>
              )}
              <p className="mt-4 text-sm font-semibold text-slate-700">Current payment status: {result?.paymentStatus ?? checkout.status}{final ? ` · transaction ${final}` : ''}</p>
            </div>

            {!result && checkout.status === 'PENDING' && (
              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <button type="button" disabled={pending} onClick={() => void simulate('success')} className="rounded-xl bg-emerald-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  {pending ? 'Processing…' : 'Simulate success'}
                </button>
                <button type="button" disabled={pending} onClick={() => void simulate('failed')} className="rounded-xl bg-red-700 px-4 py-3 font-semibold text-white disabled:opacity-50">
                  Simulate failure
                </button>
                <button type="button" disabled={pending} onClick={() => void simulate('abandoned')} className="rounded-xl border border-slate-300 px-4 py-3 font-semibold text-slate-800 disabled:opacity-50">
                  Simulate cancel
                </button>
              </div>
            )}

            {result && (
              <div role="status" className="mt-5 rounded-2xl bg-emerald-50 p-4 text-sm text-emerald-950">
                <p className="font-semibold">{result.webhookVerified ? 'Signed local webhook verified.' : 'Webhook not verified.'}</p>
                <p className="mt-1">Outcome: {result.outcome.replaceAll('_', ' ')}{result.duplicate ? ' · duplicate delivery safely ignored' : ''}.</p>
                {result.transaction && <p className="mt-2">Recorded commission {formatCurrency(Number(result.transaction.platformCommission), result.transaction.currencyCode)} and seller amount {formatCurrency(Number(result.transaction.sellerAmount), result.transaction.currencyCode)}.</p>}
                <button type="button" disabled={pending} onClick={() => void simulate(result.simulatedOutcome, true)} className="mt-4 rounded-full border border-emerald-800 px-4 py-2 font-semibold text-emerald-900 disabled:opacity-50">
                  Replay the same signed webhook
                </button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}
