import assert from 'node:assert/strict';
import { PropertyStatus, UserRole } from '@prisma/client';
import { canArchiveListing, canRestoreListing, getDeletionBlockers, type ListingDependencyCounts } from '../lib/listing-archive';
import { canEditListing } from '../lib/listing-edit';
import { canViewNonPublicProperty, isOwnerStatusTransitionAllowed, isPubliclyVisibleStatus } from '../lib/property-lifecycle';
import { buildOwnerListingWhere, getListingActions } from '../lib/owner-listings';

const empty: ListingDependencyCounts = {
  payments: 0, transactions: 0, viewings: 0, conversations: 0, enquiries: 0, callSessions: 0,
  featuredListings: 0, tenants: 0, verifications: 0, reports: 0, reviews: 0, auditLogs: 0,
};
const property = { ownerId: 'owner-1', agentId: 'agent-1' };

// Authorization: only owner, assigned agent (with a manager role) or admin may archive/restore/delete.
assert.equal(canEditListing({ id: 'owner-1', role: UserRole.OWNER }, property), true);
assert.equal(canEditListing({ id: 'agent-1', role: UserRole.AGENT }, property), true);
assert.equal(canEditListing({ id: 'stranger', role: UserRole.OWNER }, property), false);
assert.equal(canEditListing({ id: 'tenant-1', role: UserRole.TENANT }, property), false);
assert.equal(canEditListing(null, property), false);

// Archive eligibility follows the lifecycle: live/pending/suspended listings must be paused or returned first.
for (const status of [PropertyStatus.DRAFT, PropertyStatus.REJECTED, PropertyStatus.PAUSED, PropertyStatus.RENTED, PropertyStatus.SOLD]) {
  assert.equal(canArchiveListing(status), true, `${status} should be archivable`);
}
for (const status of [PropertyStatus.PUBLISHED, PropertyStatus.PENDING_REVIEW, PropertyStatus.SUSPENDED, PropertyStatus.ARCHIVED]) {
  assert.equal(canArchiveListing(status), false, `${status} should not be archivable`);
}

// Archive visibility: never public, still visible to owner/agent and in the owner's inventory scope.
assert.equal(isPubliclyVisibleStatus(PropertyStatus.ARCHIVED), false);
assert.equal(canViewNonPublicProperty(null, property), false);
assert.equal(canViewNonPublicProperty({ id: 'stranger', role: UserRole.USER }, property), false);
assert.equal(canViewNonPublicProperty({ id: 'owner-1', role: UserRole.OWNER }, property), true);
assert.equal(canViewNonPublicProperty({ id: 'agent-1', role: UserRole.AGENT }, property), true);
assert.deepEqual(buildOwnerListingWhere('owner-1', {}).AND, [{ OR: [{ ownerId: 'owner-1' }, { agentId: 'owner-1' }] }]);
assert.deepEqual(buildOwnerListingWhere('owner-1', { status: PropertyStatus.ARCHIVED }).AND, [
  { OR: [{ ownerId: 'owner-1' }, { agentId: 'owner-1' }] },
  { status: PropertyStatus.ARCHIVED },
]);

// Restore: archived -> draft only (never straight to published), and only from ARCHIVED.
assert.equal(canRestoreListing(PropertyStatus.ARCHIVED), true);
assert.equal(canRestoreListing(PropertyStatus.DRAFT), false);
assert.equal(canRestoreListing(PropertyStatus.PUBLISHED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.ARCHIVED, PropertyStatus.DRAFT), true);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.ARCHIVED, PropertyStatus.PUBLISHED), false);
assert.equal(isOwnerStatusTransitionAllowed(PropertyStatus.ARCHIVED, PropertyStatus.PENDING_REVIEW), false);
assert.deepEqual(getListingActions(PropertyStatus.ARCHIVED), ['restore']);

// Permanent deletion: only clean drafts.
assert.deepEqual(getDeletionBlockers(PropertyStatus.DRAFT, empty), []);
assert.ok(getDeletionBlockers(PropertyStatus.PUBLISHED, empty).length > 0);
assert.ok(getDeletionBlockers(PropertyStatus.ARCHIVED, empty).length > 0);
assert.ok(getDeletionBlockers(PropertyStatus.REJECTED, empty).length > 0);
for (const key of Object.keys(empty) as (keyof ListingDependencyCounts)[]) {
  const blockers = getDeletionBlockers(PropertyStatus.DRAFT, { ...empty, [key]: 1 });
  assert.equal(blockers.length, 1, `${key} history must block deletion`);
  assert.match(blockers[0], /Archive it instead/);
}
assert.match(getDeletionBlockers(PropertyStatus.DRAFT, { ...empty, payments: 2, conversations: 1 })[0], /payments, messages/);

console.log('Listing archive/delete lifecycle tests passed.');
