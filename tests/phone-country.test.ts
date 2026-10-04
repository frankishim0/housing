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

// Switching country replaces the old calling code and keeps every following digit.
assert.equal(withCallingCode('+234 803 123 4567', 'NG', 'AL'), '+355 803 123 4567');
assert.equal(withCallingCode('+233 24 123 4567', 'GH', 'GB'), '+44 24 123 4567');
assert.equal(withCallingCode('+2348031234567', 'NG', 'GH'), '+233 8031234567');
assert.equal(withCallingCode('+1 555 010 1234', 'US', 'CA'), '+1 555 010 1234');
assert.equal(withCallingCode('+1 555 010 1234', 'US', 'GB'), '+44 555 010 1234');
assert.equal(withCallingCode('+44 20 7946 0000', 'GB', 'NG'), '+234 20 7946 0000');
assert.equal(withCallingCode('+672 12345', 'AQ', 'NG'), '+234 12345');
assert.equal(withCallingCode('+234 803', 'GB', 'GH'), '+233 803');
assert.equal(withCallingCode('0803', '', 'NG'), '+234 803');
assert.equal(withCallingCode('+', 'NG', 'GH'), '+233 ');
assert.equal(withCallingCode('+1 555', 'US', ''), '+1 555');

// Every country pair swaps correctly, including shared calling codes.
for (const from of countries) {
  const fromCode = getCallingCode(from.code)!;
  for (const to of countries) {
    assert.equal(withCallingCode(`+${fromCode} 803 123 4567`, from.code, to.code), `+${getCallingCode(to.code)} 803 123 4567`, `${from.code}->${to.code}`);
  }
}
console.log(`phone country tests passed (${countries.length} countries)`);