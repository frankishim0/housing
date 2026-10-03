import { ModerationAuditAction, Prisma, UserRole, UserVerificationStatus, VerificationStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const VERIFICATION_TYPES = ['EMAIL', 'PHONE', 'IDENTITY', 'PROFESSIONAL', 'PROPERTY_OWNERSHIP', 'AGENCY', 'COMPANY'] as const;
export type VerificationType = typeof VERIFICATION_TYPES[number];

export const VERIFICATION_REQUEST_STATUSES = ['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED'] as const;

export function isVerificationType(value: string): value is VerificationType {
  return (VERIFICATION_TYPES as readonly string[]).includes(value);
}

export function isProfessionalRole(role: UserRole) {
  const professionalRoles = new Set<UserRole>([
    UserRole.OWNER,
    UserRole.LANDLORD,
    UserRole.AGENT,
    UserRole.PROPERTY_MANAGER,
    UserRole.DEVELOPER,
  ]);
  return professionalRoles.has(role);
}

export function userVerificationLabel(status: UserVerificationStatus | string) {
  return String(status).toLowerCase().replace(/_/g, ' ');
}

export function verificationBadgeLabel(type: string, status: string) {
  const base = type.replace(/_/g, ' ').toLowerCase();
  return `${base} · ${status.toLowerCase()}`;
}

export function canSubmitPropertyVerification(user: { id: string; role: UserRole }, property: { ownerId: string; agentId: string | null }) {
  return [property.ownerId, property.agentId].includes(user.id) || user.role === UserRole.ADMIN;
}

export function canViewVerification(user: { id: string; role: UserRole }, verification: { userId: string; propertyId: string | null; reviewerId?: string | null }) {
  return user.role === UserRole.ADMIN || verification.userId === user.id || verification.reviewerId === user.id;
}

export function canReviewVerification(user: { role: UserRole }) {
  return user.role === UserRole.ADMIN;
}

export async function logModerationAction(params: {
  client?: Pick<Prisma.TransactionClient, 'moderationAuditLog'>;
  actorId?: string | null;
  action: ModerationAuditAction;
  entityType: string;
  entityId: string;
  before?: Prisma.InputJsonValue;
  after?: Prisma.InputJsonValue;
  reason?: string | null;
}) {
  const client = params.client ?? prisma;
  await client.moderationAuditLog.create({
    data: {
      actorId: params.actorId ?? null,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      before: params.before,
      after: params.after,
      reason: params.reason ?? null,
    },
  });
}

export function userVerificationStatusAfterReview(type: string, status: VerificationStatus) {
  if (type !== 'IDENTITY') return UserVerificationStatus.UNVERIFIED;
  if (status === VerificationStatus.VERIFIED) return UserVerificationStatus.VERIFIED;
  if (status === VerificationStatus.REJECTED) return UserVerificationStatus.REJECTED;
  return UserVerificationStatus.PENDING;
}

export function verificationSubmissionAuditAction(type: string, hasProperty: boolean) {
  if (hasProperty || type === 'PROPERTY_OWNERSHIP') return ModerationAuditAction.PROPERTY_VERIFICATION_SUBMITTED;
  if (['PROFESSIONAL', 'AGENCY', 'COMPANY'].includes(type)) return ModerationAuditAction.PROFESSIONAL_VERIFICATION_SUBMITTED;
  return ModerationAuditAction.USER_VERIFICATION_SUBMITTED;
}

export function verificationReviewAuditAction(type: string, action: 'approve' | 'reject' | 'request_more_info' | 'suspend', hasProperty: boolean) {
  if (action === 'suspend') {
    return hasProperty || ['PROPERTY_OWNERSHIP'].includes(type)
      ? ModerationAuditAction.PROFESSIONAL_VERIFICATION_SUSPENDED
      : ModerationAuditAction.USER_SUSPENDED;
  }
  const group = hasProperty || type === 'PROPERTY_OWNERSHIP'
    ? 'PROPERTY'
    : ['PROFESSIONAL', 'AGENCY', 'COMPANY'].includes(type)
      ? 'PROFESSIONAL'
      : 'USER';
  if (action === 'approve') {
    if (group === 'PROPERTY') return ModerationAuditAction.PROPERTY_VERIFICATION_APPROVED;
    if (group === 'PROFESSIONAL') return ModerationAuditAction.PROFESSIONAL_VERIFICATION_APPROVED;
    return ModerationAuditAction.USER_VERIFICATION_APPROVED;
  }
  if (action === 'reject') {
    if (group === 'PROPERTY') return ModerationAuditAction.PROPERTY_VERIFICATION_REJECTED;
    if (group === 'PROFESSIONAL') return ModerationAuditAction.PROFESSIONAL_VERIFICATION_REJECTED;
    return ModerationAuditAction.USER_VERIFICATION_REJECTED;
  }
  if (group === 'PROPERTY') return ModerationAuditAction.PROPERTY_VERIFICATION_INFO_REQUESTED;
  if (group === 'PROFESSIONAL') return ModerationAuditAction.PROFESSIONAL_VERIFICATION_INFO_REQUESTED;
  return ModerationAuditAction.USER_VERIFICATION_INFO_REQUESTED;
}
