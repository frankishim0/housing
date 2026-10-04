import { getCountries, getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

const supportedCountries = new Set<string>(getCountries());

// libphonenumber-js has no metadata for these territories. They use the calling code of the
// country that administers or serves them, which is resolved from the library at runtime.
const CALLING_CODE_FALLBACKS: Record<string, CountryCode> = {
  AQ: 'NF',
  BV: 'NO',
  TF: 'RE',
  HM: 'AU',
  PN: 'NZ',
  GS: 'FK',
  UM: 'US',
};

export function getCallingCode(countryCode: string): string | null {
  const code = countryCode.toUpperCase();
  const source = supportedCountries.has(code) ? (code as CountryCode) : CALLING_CODE_FALLBACKS[code];
  return source ? getCountryCallingCode(source) : null;
}

function callingPrefix(countryCode: string) {
  const code = countryCode ? getCallingCode(countryCode) : null;
  return code ? `+${code}` : '';
}

/** Swaps the leading calling code of a phone value when the selected country changes, keeping the typed digits. */
export function withCallingCode(phone: string, previousCountry: string, nextCountry: string) {
  const next = callingPrefix(nextCountry);
  if (!next) return phone;
  const previous = callingPrefix(previousCountry);
  const trimmed = phone.trim();
  if (!trimmed) return `${next} `;
  if (previous && trimmed.startsWith(previous)) return `${next}${trimmed.slice(previous.length)}`;
  if (trimmed.startsWith('+')) return phone;
  return `${next} ${trimmed.replace(/^0+/, '')}`;
}
