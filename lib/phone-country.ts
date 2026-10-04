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

const knownCallingCodes = new Set<string>(
  [...supportedCountries].map((country) => getCountryCallingCode(country as CountryCode)),
);

// Calling codes are prefix-free (E.164), so the leading code of an international number is unambiguous.
function leadingCallingCode(phone: string) {
  const digits = phone.slice(1).replace(/^[\s().-]+/, '');
  for (let length = 1; length <= 3; length += 1) {
    const candidate = digits.slice(0, length);
    if (knownCallingCodes.has(candidate)) return { code: candidate, rest: digits.slice(length).replace(/^[\s().-]+/, '') };
  }
  return null;
}

/** Replaces the calling code at the start of the phone with the new country's code, keeping every digit that follows. */
export function withCallingCode(phone: string, _previousCountry: string, nextCountry: string) {
  const next = callingPrefix(nextCountry);
  if (!next) return phone;
  const trimmed = phone.trim();
  if (!trimmed || trimmed === '+') return `${next} `;
  if (trimmed.startsWith('+')) {
    const leading = leadingCallingCode(trimmed);
    const rest = leading ? leading.rest : trimmed.slice(1).replace(/^[\s().-]+/, '');
    return `${next} ${rest}`;
  }
  return `${next} ${trimmed.replace(/^0+/, '')}`;
}