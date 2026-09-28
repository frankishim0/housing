'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { CurrencySelect } from '@/components/currency-select';
import { getCountryCurrency, isCurrencyCode } from '@/lib/international';

const STORAGE_KEY = 'housing-display-currency';
const CurrencyPreferenceContext = createContext<{ currency: string; setCurrency: (currency: string) => void } | null>(null);

function currencyForBrowserLocale() {
  for (const locale of navigator.languages) {
    try {
      const region = new Intl.Locale(locale).region;
      if (region) return getCountryCurrency(region);
    } catch {
      continue;
    }
  }
  return 'USD';
}

export function CurrencyPreferenceProvider({ children }: { children: React.ReactNode }) {
  const [currency, setCurrencyState] = useState('USD');

  useEffect(() => {
    let cancelled = false;
    async function loadPreference() {
      const savedCurrency = localStorage.getItem(STORAGE_KEY);
      if (savedCurrency && isCurrencyCode(savedCurrency)) {
        if (!cancelled) setCurrencyState(savedCurrency.toUpperCase());
        return;
      }

      if (!cancelled) setCurrencyState(currencyForBrowserLocale());
      try {
        const response = await fetch('/api/auth/me', { cache: 'no-store' });
        if (!response.ok) return;
        const result = await response.json() as { user?: { preferredCurrency?: string } };
        const preferredCurrency = result.user?.preferredCurrency;
        if (!cancelled && preferredCurrency && isCurrencyCode(preferredCurrency)) {
          setCurrencyState(preferredCurrency.toUpperCase());
        }
      } catch (error: unknown) {
        console.error('Could not load the account currency preference; using the browser locale default.', error);
      }
    }
    void loadPreference();
    return () => { cancelled = true; };
  }, []);

  function setCurrency(nextCurrency: string) {
    if (!isCurrencyCode(nextCurrency)) return;
    const normalized = nextCurrency.toUpperCase();
    setCurrencyState(normalized);
    localStorage.setItem(STORAGE_KEY, normalized);
  }

  return (
    <CurrencyPreferenceContext.Provider value={{ currency, setCurrency }}>
      {children}
    </CurrencyPreferenceContext.Provider>
  );
}

export function useCurrencyPreference(fallback = 'USD') {
  const preference = useContext(CurrencyPreferenceContext);
  return preference ? preference.currency : fallback;
}

export function useSetCurrencyPreference() {
  return useContext(CurrencyPreferenceContext)?.setCurrency;
}

export function CurrencyPreferenceBar() {
  const preference = useContext(CurrencyPreferenceContext);
  if (!preference) return null;
  return (
    <div className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-end gap-2 px-4 py-2 text-xs text-slate-600 lg:px-8">
        <label htmlFor="display-currency" className="shrink-0">Display prices in</label>
        <CurrencySelect
          name="display-currency"
          value={preference.currency}
          onChange={preference.setCurrency}
          className="max-w-[13rem] rounded-md border border-slate-300 bg-white px-2 py-1.5 text-xs"
        />
      </div>
    </div>
  );
}
