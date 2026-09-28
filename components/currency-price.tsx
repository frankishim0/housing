'use client';

import { useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/international';
import { getExchangeRate, type ExchangeRate } from '@/lib/exchange-rate-client';
import { useCurrencyPreference } from '@/components/currency-preference';

export function CurrencyPrice({
  amount,
  currency,
  preferredCurrency = 'USD',
  className = '',
}: {
  amount: number;
  currency: string;
  preferredCurrency?: string;
  className?: string;
}) {
  const source = currency.toUpperCase();
  const target = useCurrencyPreference(preferredCurrency).toUpperCase();
  const [rateState, setRateState] = useState<{ key: string; value: ExchangeRate } | null>(null);
  const [failedRateKey, setFailedRateKey] = useState<string | null>(null);
  const rateKey = `${source}:${target}`;
  const converted = rateState?.key === rateKey ? rateState.value : null;

  useEffect(() => {
    if (source === target) return;
    let cancelled = false;
    getExchangeRate(source, target)
      .then((rate) => {
        if (!cancelled) {
          setRateState({ key: rateKey, value: rate });
        }
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setFailedRateKey(rateKey);
          console.error(`Could not convert a ${source} listing price to ${target}; displaying the original amount.`, error);
        }
      });
    return () => { cancelled = true; };
  }, [source, target, rateKey]);

  return (
    <div className={className}>
      {converted && (
        <>
          <p>{formatCurrency(amount * converted.rate, target)}<span className="ml-1 text-xs font-normal text-slate-500">converted estimate</span></p>
          <p className="mt-1 text-xs font-normal text-slate-500" title={converted.date ?? undefined}>Original listing price: {formatCurrency(amount, source)}</p>
        </>
      )}
      {!converted && (
        <>
          <p>{formatCurrency(amount, source)}<span className="ml-1 text-xs font-normal text-slate-500">original listing price</span></p>
          {source !== target && failedRateKey !== rateKey && <p role="status" className="mt-1 text-xs font-normal text-slate-500">Loading {target} conversion…</p>}
          {source !== target && failedRateKey === rateKey && <p role="status" className="mt-1 text-xs font-normal text-amber-700">Conversion temporarily unavailable; original price shown.</p>}
        </>
      )}
    </div>
  );
}