import assert from 'node:assert/strict';
import { PropertyStatus, UserRole } from '@prisma/client';
import {
  canViewNonPublicProperty,
  isOwnerStatusTransitionAllowed,
  isPubliclyVisibleStatus,
  shouldInvalidateVerification,
} from '../lib/property-lifecycle';
import { propertyUpdateSchema } from '../lib/validation';

// 1. Owner cannot directly publish a listing: PUBLISHED is unreachable from any
// status through the owner transition map, regardless of starting status.
for (const status of Object.values(PropertyStatus)) {
  assert.equal(isOwnerStatusTransitionAllowed(status, PropertyStatus.PUBLISHED), false, `owner must not publish from ${status}`);
}

// 2. Owner cannot set arbitrary statuses outside the explicit allow-list.
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.DRAFT, PropertyStatus.SUSPENDED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.DRAFT, PropertyStatus.REJECTED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.PENDING_REVIEW, PropertyStatus.REJECTED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.DRAFT, PropertyStatus.SOLD), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.SUSPENDED, PropertyStatus.PENDING_REVIEW), false);
// ...but the intended lifecycle moves remain available.
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.DRAFT, PropertyStatus.PENDING_REVIEW), true);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.REJECTED, PropertyStatus.DRAFT), true);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.PUBLISHED, PropertyStatus.PAUSED), true);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.PUBLISHED, PropertyStatus.RENTED), true);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.PUBLISHED, PropertyStatus.SOLD), true);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.PAUSED, PropertyStatus.PENDING_REVIEW), true);

// 3. Non-public listings cannot be fetched publicly; completed public listings remain visible.
assert.equal(isPubliclyVisibleStatus(PropertyStatus.DRAFT), false);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.PENDING_REVIEW), false);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.REJECTED), false);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.PAUSED), false);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.SUSPENDED), false);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.PUBLISHED), true);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.RENTED), true);
assert.equal(isPubliclyVisibleStatus(PropertyStatus.SOLD), true);

// 4. Unauthorized users cannot view/change a non-public listing; owner, assigned
// agent, and admin retain access to their own non-public listings.
const draftProperty = { ownerId: 'owner-1', agentId: 'agent-1' };
assert.equal(canViewNonPublicProperty(null, draftProperty), false);
assert.equal(canViewNonPublicProperty({ id: 'stranger', role: UserRole.USER }, draftProperty), false);
assert.equal(canViewNonPublicProperty({ id: 'owner-1', role: UserRole.OWNER }, draftProperty), true);
assert.equal(canViewNonPublicProperty({ id: 'agent-1', role: UserRole.AGENT }, draftProperty), true);
assert.equal(canViewNonPublicProperty({ id: 'admin-1', role: UserRole.ADMIN }, draftProperty), true);

// 5. Material edits invalidate a stale verification; cosmetic/amenity-style
// changes and edits to an already-unverified listing do not.
assert.equal(shouldInvalidateVerification(['price'], true), true);
assert.equal(shouldInvalidateVerification(['title'], true), true);
assert.equal(shouldInvalidateVerification(['description', 'currencyCode'], true), true);
assert.equal(shouldInvalidateVerification(['hasPool'], true), false);
assert.equal(shouldInvalidateVerification(['parkingSpaces', 'luxury'], true), false);
assert.equal(shouldInvalidateVerification(['price'], false), false);

// 6. Protected fields can never be client-controlled through the update schema,
// and unknown keys are rejected outright.
assert.equal(propertyUpdateSchema.safeParse({ ownerId: 'someone-else' }).success, false);
assert.equal(propertyUpdateSchema.safeParse({ agentId: 'someone-else' }).success, false);
assert.equal(propertyUpdateSchema.safeParse({ verified: true }).success, false);
assert.equal(propertyUpdateSchema.safeParse({ verifiedAt: new Date().toISOString() }).success, false);
assert.equal(propertyUpdateSchema.safeParse({ id: 'different-id' }).success, false);
assert.equal(propertyUpdateSchema.safeParse({ title: 'Updated title', price: 125000 }).success, true);
assert.equal(propertyUpdateSchema.safeParse({ status: PropertyStatus.SUSPENDED }).success, true);
assert.equal(propertyUpdateSchema.safeParse({ status: 'NOT_A_STATUS' }).success, false);

console.log('Listing lifecycle security tests passed.');
