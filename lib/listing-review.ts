import { ModerationAuditAction, PropertyStatus, UserRole } from '@prisma/client';
import { z } from 'zod';

export const adminPropertyReviewSchema = z.object({
  status: z.enum(['PUBLISHED', 'REJECTED', 'SUSPENDED', 'PAUSED']),
  reason: z.string().trim().max(4000).optional(),
}).refine((value) => value.status !== 'REJECTED' || Boolean(normalizeRejectionReason(value.reason)), {
  path: ['reason'],
  message: 'A rejection reason is required.',
});

export function normalizeRejectionReason(raw: unknown): string | null {
  const value = typeof raw === 'string' ? raw.trim() : '';
  return value ? value : null;
}

export function canAccessListingReviewFeedback(
  user: { id: string; role: UserRole } | null | undefined,
  property: { ownerId: string; agentId: string | null },
) {
  if (!user) return false;
  return user.role === UserRole.ADMIN || property.ownerId === user.id || property.agentId === user.id;
}

export function isPropertyReviewStatus(status: PropertyStatus) {
  return status === PropertyStatus.REJECTED || status === PropertyStatus.PENDING_REVIEW;
}

export function propertyReviewSubmissionAction() {
  return ModerationAuditAction.PROPERTY_REVIEW_SUBMITTED;
}

export function propertyReviewRejectionAction() {
  return ModerationAuditAction.PROPERTY_REVIEW_REJECTED;
}
