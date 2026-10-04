import { getCountryCallingCode, type CountryCode } from 'libphonenumber-js';

function callingPrefix(countryCode: string) {
  if (!countryCode) return '';
  try {
    return `+${getCountryCallingCode(countryCode as CountryCode)}`;
  } catch {
    return '';
  }
}

/** Swaps the leading calling code of a phone value when the selected country changes. */
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
