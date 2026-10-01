'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { formatCurrency } from '@/lib/international';

interface Quote {
  reference: string;
  status: string;
  amount: string;
  currencyCode: string;
  platformCommission: string;
  buyerPlatformFee: string;
  paymentProcessingFee: string;
  totalBuyerDue: string;
  sellerAmount: string;
  finalPayout: string;
  commissionPayer: string;
  commissionRuleName: string | null;
  id: string;
}

export function TransactionQuote({ propertyId }: { propertyId: string }) {
  const router = useRouter();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [checkoutPending, setCheckoutPending] = useState(false);

  async function requestQuote() {
    setPending(true);
    setError('');
    try {
      const response = await fetch('/api/transactions/quote', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push('/auth');
        return;
      }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to calculate transaction fees.');
      setQuote(result.data as Quote);
    } catch (quoteError) {
      setError(quoteError instanceof Error ? quoteError.message : 'Unable to calculate transaction fees.');
    } finally {
      setPending(false);
    }
  }

  async function startCheckout() {
    if (!quote) return;
    setCheckoutPending(true);
    setError('');
    try {
      const response = await fetch(`/api/transactions/${encodeURIComponent(quote.id)}/checkout`, { method: 'POST' });
      const result = await response.json();
      if (response.status === 401) {
        router.push('/auth');
        return;
      }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to start test checkout.');
      window.location.assign(result.data.authorizationUrl as string);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : 'Unable to start test checkout.');
      setCheckoutPending(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
      <button type="button" onClick={() => void requestQuote()} disabled={pending} className="w-full rounded-full border border-emerald-700 bg-white px-4 py-3 font-semibold text-emerald-900 disabled:opacity-60">
        {pending ? 'Calculating…' : quote ? 'Refresh transaction fee quote' : 'View transaction fee before proceeding'}
      </button>
      {error && <p role="alert" className="mt-3 text-sm text-red-700">{error}</p>}
      {quote && (
        <dl className="mt-4 space-y-2 text-sm text-slate-700">
          <div className="flex justify-between gap-4"><dt>Property price (original listing currency)</dt><dd className="font-semibold">{formatCurrency(Number(quote.amount), quote.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Platform commission</dt><dd>{formatCurrency(Number(quote.platformCommission), quote.currencyCode)} ({quote.commissionPayer.toLowerCase()}-paid)</dd></div>
          <div className="flex justify-between gap-4"><dt>Buyer platform fee</dt><dd>{formatCurrency(Number(quote.buyerPlatformFee), quote.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Estimated processing fee (deducted from seller proceeds)</dt><dd>{formatCurrency(Number(quote.paymentProcessingFee), quote.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-emerald-200 pt-2 font-bold text-slate-900"><dt>Buyer total due via Paystack test payment</dt><dd>{formatCurrency(Number(quote.totalBuyerDue), quote.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Estimated seller amount</dt><dd>{formatCurrency(Number(quote.sellerAmount), quote.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Estimated final payout after processing fee</dt><dd>{formatCurrency(Number(quote.finalPayout), quote.currencyCode)}</dd></div>
          <button type="button" onClick={() => void startCheckout()} disabled={checkoutPending || quote.status === 'PAID' || quote.status === 'FAILED' || quote.status === 'CANCELLED'} className="w-full rounded-full bg-indigo-700 px-4 py-3 font-semibold text-white disabled:opacity-60">
            {checkoutPending ? 'Opening secure Paystack test payment…' : quote.status === 'PENDING_PAYMENT' ? 'Continue Paystack test payment' : 'Pay securely with Paystack test mode'}
          </button>
          <p className="rounded-xl bg-indigo-50 p-3 text-xs text-indigo-900">Test mode only. Use Paystack test payment details (or the local payment simulator if Paystack test mode is unavailable for this listing&apos;s currency). This payment cannot charge a real card or settle a payout.</p>
          <p className="rounded-xl bg-white/70 p-3 text-xs text-slate-600">Quote {quote.reference} is server-priced; payment becomes final only after Paystack verifies the payment or a signed webhook is received.</p>
          {!quote.commissionRuleName && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-900">No commission rule is configured for this listing, so this quote currently applies no platform commission. The platform administrator can configure country, currency, property-type, and transaction-specific rules.</p>}
        </dl>
      )}
    </section>
  );
}
