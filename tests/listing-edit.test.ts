import assert from 'node:assert/strict';
import { PropertyStatus, UserRole } from '@prisma/client';
import { canEditListing } from '../lib/listing-edit';
import { isOwnerStatusTransitionAllowed, shouldInvalidateVerification } from '../lib/property-lifecycle';
import { propertyUpdateSchema } from '../lib/validation';

const property = { ownerId: 'owner-1', agentId: 'agent-1' };
assert.equal(canEditListing({ id: 'owner-1', role: UserRole.OWNER }, property), true);
assert.equal(canEditListing({ id: 'agent-1', role: UserRole.AGENT }, property), true);
assert.equal(canEditListing({ id: 'stranger', role: UserRole.AGENT }, property), false);
assert.equal(canEditListing({ id: 'stranger', role: UserRole.USER }, property), false);
assert.equal(canEditListing(null, property), false);
assert.equal(canEditListing({ id: 'admin-1', role: UserRole.ADMIN }, property), true);

for (const key of ['ownerId', 'agentId', 'verified', 'verifiedAt', 'slug', 'propertyTypeId', 'currencyCode', 'publishedAt', 'viewCount']) {
  assert.equal(propertyUpdateSchema.safeParse({ [key]: 'forged' }).success, false, `${key} must not be editable`);
}

const location = {
  countryCode: 'NG',
  region: 'Lagos',
  city: 'Ikeja',
  neighborhood: 'Allen',
  postalCode: '100001',
  address: '12 Test Road',
  latitude: 6.6018,
  longitude: 3.3515,
  hideExactAddress: true,
};
const amenities = ['Generator', 'Security'];
const update = propertyUpdateSchema.safeParse({ title: 'Updated listing', location, amenities });
assert.equal(update.success, true, 'location and amenities should be accepted');
if (update.success) {
  assert.deepEqual(update.data.location, location);
  assert.deepEqual(update.data.amenities, amenities);
  assert.equal(update.data.status, undefined, 'ordinary edit payload must not carry a status');
}
assert.equal(propertyUpdateSchema.safeParse({ location: { ...location, latitude: 100 } }).success, false);
assert.equal(propertyUpdateSchema.safeParse({ amenities: ['x'.repeat(81)] }).success, false);

// A routine edit omits status, so applying it leaves the existing DRAFT status untouched.
const draftEdit = propertyUpdateSchema.parse({ title: 'Updated draft' });
assert.equal(draftEdit.status, undefined);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.DRAFT, PropertyStatus.PUBLISHED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.REJECTED, PropertyStatus.PUBLISHED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.REJECTED, PropertyStatus.DRAFT), true);

assert.equal(shouldInvalidateVerification(['location'], true), true);
assert.equal(shouldInvalidateVerification(['amenities'], true), true);
assert.equal(shouldInvalidateVerification(['location'], false), false);

console.log('Listing edit authorization, validation, and lifecycle tests passed.');
