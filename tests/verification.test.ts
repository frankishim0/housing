import assert from 'node:assert/strict';
import { UserRole, UserVerificationStatus, VerificationStatus } from '@prisma/client';
import { isReportCategory, isReportTargetType } from '../lib/moderation';
import {
  canReviewVerification,
  canSubmitPropertyVerification,
  canViewVerification,
  isProfessionalRole,
  isVerificationType,
  userVerificationLabel,
  userVerificationStatusAfterReview,
  verificationReviewAuditAction,
  verificationSubmissionAuditAction,
} from '../lib/verification';

assert.equal(isVerificationType('IDENTITY'), true);
assert.equal(isVerificationType('PROPERTY_OWNERSHIP'), true);
assert.equal(isVerificationType('INVALID'), false);

assert.equal(isProfessionalRole(UserRole.AGENT), true);
assert.equal(isProfessionalRole(UserRole.USER), false);

assert.equal(canSubmitPropertyVerification({ id: 'u1', role: UserRole.USER }, { ownerId: 'u1', agentId: null }), true);
assert.equal(canSubmitPropertyVerification({ id: 'u2', role: UserRole.AGENT }, { ownerId: 'u1', agentId: 'u2' }), true);
assert.equal(canSubmitPropertyVerification({ id: 'u3', role: UserRole.USER }, { ownerId: 'u1', agentId: 'u2' }), false);

assert.equal(canViewVerification({ id: 'admin', role: UserRole.ADMIN }, { userId: 'u1', propertyId: null, reviewerId: null }), true);
assert.equal(canViewVerification({ id: 'u1', role: UserRole.USER }, { userId: 'u1', propertyId: null, reviewerId: null }), true);
assert.equal(canViewVerification({ id: 'u2', role: UserRole.USER }, { userId: 'u1', propertyId: null, reviewerId: null }), false);

assert.equal(canReviewVerification({ role: UserRole.ADMIN }), true);
assert.equal(canReviewVerification({ role: UserRole.USER }), false);

assert.equal(userVerificationLabel(UserVerificationStatus.UNVERIFIED), 'unverified');
assert.equal(userVerificationLabel('REJECTED'), 'rejected');
assert.equal(userVerificationStatusAfterReview('EMAIL', VerificationStatus.VERIFIED), UserVerificationStatus.UNVERIFIED);
assert.equal(userVerificationStatusAfterReview('IDENTITY', VerificationStatus.REJECTED), UserVerificationStatus.REJECTED);
assert.equal(userVerificationStatusAfterReview('PROPERTY_OWNERSHIP', VerificationStatus.VERIFIED), UserVerificationStatus.UNVERIFIED);
assert.equal(verificationSubmissionAuditAction('IDENTITY', false), 'USER_VERIFICATION_SUBMITTED');
assert.equal(verificationSubmissionAuditAction('PROFESSIONAL', false), 'PROFESSIONAL_VERIFICATION_SUBMITTED');
assert.equal(verificationSubmissionAuditAction('PROPERTY_OWNERSHIP', true), 'PROPERTY_VERIFICATION_SUBMITTED');
assert.equal(verificationReviewAuditAction('IDENTITY', 'approve', false), 'USER_VERIFICATION_APPROVED');
assert.equal(verificationReviewAuditAction('AGENCY', 'reject', false), 'PROFESSIONAL_VERIFICATION_REJECTED');
assert.equal(verificationReviewAuditAction('PROPERTY_OWNERSHIP', 'request_more_info', true), 'PROPERTY_VERIFICATION_INFO_REQUESTED');

assert.equal(isReportCategory('FRAUD_SCAM'), true);
assert.equal(isReportCategory('OTHER'), true);
assert.equal(isReportCategory('HARMLESS'), false);
assert.equal(isReportTargetType('PROPERTY'), true);
assert.equal(isReportTargetType('MESSAGE'), true);
assert.equal(isReportTargetType('ACCOUNT'), false);

console.log('Verification and moderation helper tests passed.');
