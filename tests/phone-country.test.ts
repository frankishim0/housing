import assert from 'node:assert/strict';
import { countries } from '../lib/international';
import { getCallingCode, withCallingCode } from '../lib/phone-country';

assert.equal(countries.length, 249);
for (const country of countries) {
  const code = getCallingCode(country.code);
  assert.ok(code && /^\d{1,4}$/.test(code), `${country.code} (${country.name}) has no valid calling code`);
  assert.equal(withCallingCode('', '', country.code), `+${code} `);
}

const expected: Record<string, string> = { NG: '234', GH: '233', GB: '44', US: '1', CA: '1', IN: '91', ZA: '27', JM: '1', AQ: '672', UM: '1', PN: '64', GS: '500', BV: '47', TF: '262', HM: '61' };
for (const [country, code] of Object.entries(expected)) assert.equal(getCallingCode(country), code, country);

// Digits are preserved across changes, including shared calling codes.
assert.equal(withCallingCode('+234 803 123 4567', 'NG', 'GH'), '+233 803 123 4567');
assert.equal(withCallingCode('+1 555 010 1234', 'US', 'CA'), '+1 555 010 1234');
assert.equal(withCallingCode('+1 555 010 1234', 'US', 'UM'), '+1 555 010 1234');
assert.equal(withCallingCode('+1 555 010 1234', 'US', 'GB'), '+44 555 010 1234');
assert.equal(withCallingCode('+672 12345', 'AQ', 'NG'), '+234 12345');
assert.equal(withCallingCode('0803', '', 'NG'), '+234 803');
assert.equal(withCallingCode('+1 555', 'US', ''), '+1 555');
assert.equal(withCallingCode('+49 30 1234', '', 'NG'), '+49 30 1234');
console.log(`phone country tests passed (${countries.length} countries)`);
