import { getData } from 'country-list';
import countryToCurrency from 'country-to-currency';

export const countries = getData().sort((left, right) => left.name.localeCompare(right.name));
export const currencyCodes = [...new Set(Object.values(countryToCurrency))].sort();

const currencyNames = new Intl.DisplayNames(['en'], { type: 'currency' });

export function getCountryCurrency(countryCode: string) {
  return countryToCurrency[countryCode.toUpperCase() as keyof typeof countryToCurrency] ?? 'USD';
}

export function isCurrencyCode(value: string): boolean {
  return currencyCodes.includes(value.toUpperCase() as (typeof currencyCodes)[number]);
}

export function getCurrencyName(code: string) {
  try {
    return currencyNames.of(code.toUpperCase()) ?? code.toUpperCase();
  } catch {
    return code.toUpperCase();
  }
}

export function formatCurrency(value: number, currency: string, locale?: string) {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency.toUpperCase(),
    maximumFractionDigits: 2,
  }).format(value);
}

export function formatNumber(value: number, locale?: string) {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export function formatDate(value: Date | string, locale?: string, timeZone?: string) {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone,
  }).format(new Date(value));
}

export function formatMeasurement(value: number, unit: 'SQUARE_METERS' | 'SQUARE_FEET' | 'ACRES' | 'HECTARES', locale?: string) {
  const labels = {
    SQUARE_METERS: 'm²',
    SQUARE_FEET: 'ft²',
    ACRES: 'ac',
    HECTARES: 'ha',
  };
  return `${formatNumber(value, locale)} ${labels[unit]}`;
}

export function convertMeasurement(value: number, from: 'SQUARE_METERS' | 'SQUARE_FEET' | 'ACRES' | 'HECTARES', to: 'SQUARE_METERS' | 'SQUARE_FEET' | 'ACRES' | 'HECTARES') {
  const squareMeters = {
    SQUARE_METERS: 1,
    SQUARE_FEET: 0.09290304,
    ACRES: 4046.8564224,
    HECTARES: 10_000,
  };
  return value * squareMeters[from] / squareMeters[to];
}
