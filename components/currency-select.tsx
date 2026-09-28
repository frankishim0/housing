'use client';

import { currencyCodes } from '@/lib/international';

const currencyNames: Record<string, string> = {
  USD: 'US Dollar',
  EUR: 'Euro',
  GBP: 'British Pound',
  NGN: 'Nigerian Naira',
  CAD: 'Canadian Dollar',
  AUD: 'Australian Dollar',
  AED: 'UAE Dirham',
  ZAR: 'South African Rand',
};
const popularCurrencies = ['USD', 'EUR', 'GBP', 'NGN', 'CAD', 'AUD', 'AED', 'ZAR'];
const popularCurrencySet = new Set(popularCurrencies);
const availableCurrencySet = new Set<string>(currencyCodes);
const otherCurrencies = currencyCodes.filter((code) => !popularCurrencySet.has(code));

export function CurrencySelect({
  name = 'preferredCurrency',
  defaultValue = 'USD',
  required = true,
  className = '',
  value,
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      {...(value === undefined ? { defaultValue } : { value })}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      required={required}
      className={className}
    >
      {!required && <option value="">Any listing currency</option>}
      <optgroup label="Popular currencies">
        {popularCurrencies.filter((code) => availableCurrencySet.has(code)).map((code) => (
          <option key={code} value={code}>{currencyNames[code] ? `${code} — ${currencyNames[code]}` : code}</option>
        ))}
      </optgroup>
      <optgroup label="All currencies">
        {otherCurrencies.map((code) => <option key={code} value={code}>{code}</option>)}
      </optgroup>
    </select>
  );
}
