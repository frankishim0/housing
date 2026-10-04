import assert from 'node:assert/strict';
import { withCallingCode } from '../lib/phone-country';
assert.equal(withCallingCode('', '', 'NG'), '+234 ');
assert.equal(withCallingCode('+234 801', 'NG', 'GH'), '+233 801');
assert.equal(withCallingCode('', 'NG', 'GB'), '+44 ');
assert.equal(withCallingCode('', '', 'US'), '+1 ');
assert.equal(withCallingCode('0801', '', 'NG'), '+234 801');
assert.equal(withCallingCode('+1 555', 'US', ''), '+1 555');
console.log('phone country tests passed');
