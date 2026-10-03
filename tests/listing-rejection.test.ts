import assert from 'node:assert/strict';
import { PropertyStatus, UserRole } from '@prisma/client';
import {
  adminPropertyReviewSchema,
  canAccessListingReviewFeedback,
  isPropertyReviewStatus,
  normalizeRejectionReason,
  propertyReviewRejectionAction,
  propertyReviewSubmissionAction,
} from '../lib/listing-review';

assert.equal(normalizeRejectionReason('   Reason here   '), 'Reason here');
assert.equal(normalizeRejectionReason(''), null);
assert.equal(normalizeRejectionReason(null), null);
assert.equal(adminPropertyReviewSchema.safeParse({ status: 'REJECTED', reason: 'Missing details' }).success, true);
assert.equal(adminPropertyReviewSchema.safeParse({ status: 'REJECTED', reason: '   ' }).success, false);
assert.equal(adminPropertyReviewSchema.safeParse({ status: 'PUBLISHED' }).success, true);
assert.equal(canAccessListingReviewFeedback({ id: 'owner-1', role: UserRole.OWNER }, { ownerId: 'owner-1', agentId: 'agent-1' }), true);
assert.equal(canAccessListingReviewFeedback({ id: 'agent-1', role: UserRole.AGENT }, { ownerId: 'owner-2', agentId: 'agent-1' }), true);
assert.equal(canAccessListingReviewFeedback({ id: 'stranger', role: UserRole.USER }, { ownerId: 'owner-2', agentId: 'agent-1' }), false);
assert.equal(canAccessListingReviewFeedback(null, { ownerId: 'owner-2', agentId: null }), false);
assert.equal(canAccessListingReviewFeedback({ id: 'admin-1', role: UserRole.ADMIN }, { ownerId: 'owner-2', agentId: null }), true);
assert.equal(isPropertyReviewStatus(PropertyStatus.REJECTED), true);
assert.equal(isPropertyReviewStatus(PropertyStatus.PENDING_REVIEW), true);
assert.equal(isPropertyReviewStatus(PropertyStatus.DRAFT), false);
assert.equal(propertyReviewSubmissionAction(), 'PROPERTY_REVIEW_SUBMITTED');
assert.equal(propertyReviewRejectionAction(), 'PROPERTY_REVIEW_REJECTED');
assert.equal(PropertyStatus.REJECTED === PropertyStatus.REJECTED, true);

console.log('Listing rejection helpers tests passed.');
