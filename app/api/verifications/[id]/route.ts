import { NextRequest, NextResponse } from 'next/server';
import { UserRole, UserVerificationStatus, VerificationStatus } from '@prisma/client';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canViewVerification, isProfessionalRole, logModerationAction, userVerificationStatusAfterReview, verificationReviewAuditAction } from '@/lib/verification';

const patchSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('request_more_info'), notes: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal('approve'), notes: z.string().trim().max(4000).optional() }),
  z.object({ action: z.literal('reject'), notes: z.string().trim().min(1).max(4000) }),
  z.object({ action: z.literal('suspend'), notes: z.string().trim().min(1).max(4000) }),
]);

export async function GET(_request: NextRequest, context: RouteContext<'/api/verifications/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const verification = await prisma.verification.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, title: true, slug: true, verified: true, verifiedAt: true } },
      reviewer: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, role: true, verificationStatus: true } },
    },
  });
  if (!verification) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 });
  if (!canViewVerification(user, verification)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  return NextResponse.json({
    data: {
      ...verification,
      documents: undefined,
      documentUrl: undefined,
      documentCount: Array.isArray(verification.documents) ? verification.documents.length : 0,
    },
  });
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/verifications/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (user.role !== UserRole.ADMIN) return NextResponse.json({ error: 'Admin role required.' }, { status: 403 });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;

  const verification = await prisma.verification.findUnique({
    where: { id },
    include: { property: true, user: true },
  });
  if (!verification) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 });

  const nextStatus = parsed.data.action === 'approve'
    ? VerificationStatus.VERIFIED
    : parsed.data.action === 'reject'
      ? VerificationStatus.REJECTED
      : parsed.data.action === 'suspend'
        ? VerificationStatus.SUSPENDED
        : VerificationStatus.PENDING;
  const reviewedAt = new Date();
  const professionalVerification = isProfessionalRole(verification.user.role)
    && ['PROFESSIONAL', 'AGENCY', 'COMPANY'].includes(verification.type);

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.verification.update({
      where: { id },
      data: {
        status: nextStatus,
        reviewerId: user.id,
        reviewedAt,
        rejectionReason: parsed.data.action === 'reject' || parsed.data.action === 'suspend' ? parsed.data.notes : null,
        notes: parsed.data.action === 'request_more_info' ? parsed.data.notes : verification.notes,
      },
    });

    if (verification.propertyId) {
      await tx.property.update({
        where: { id: verification.propertyId },
        data: {
          verified: parsed.data.action === 'approve',
          verifiedAt: parsed.data.action === 'approve' ? reviewedAt : null,
        },
      });
    }

    if (!verification.propertyId && verification.type === 'IDENTITY') {
      await tx.user.update({
        where: { id: verification.userId },
        data: {
          verificationStatus: userVerificationStatusAfterReview(verification.type, nextStatus),
          verificationReviewedAt: reviewedAt,
          verificationReviewedById: user.id,
        },
      });
    }
    if (!verification.propertyId && parsed.data.action === 'suspend') {
      await tx.user.update({
        where: { id: verification.userId },
        data: { suspendedAt: reviewedAt, suspendedReason: parsed.data.notes },
      });
    }
    if (!verification.propertyId && verification.type === 'EMAIL' && parsed.data.action === 'approve') {
      await tx.user.update({ where: { id: verification.userId }, data: { emailVerifiedAt: reviewedAt } });
    }
    if (!verification.propertyId && verification.type === 'PHONE' && parsed.data.action === 'approve') {
      await tx.user.update({ where: { id: verification.userId }, data: { phoneVerifiedAt: reviewedAt } });
    }
    if (!verification.propertyId && professionalVerification) {
      await tx.agentProfile.upsert({
        where: { userId: verification.userId },
        create: { userId: verification.userId, verified: parsed.data.action === 'approve', verifiedAt: parsed.data.action === 'approve' ? reviewedAt : null },
        update: { verified: parsed.data.action === 'approve', verifiedAt: parsed.data.action === 'approve' ? reviewedAt : null },
      });
    }

    await tx.notification.create({
      data: {
        userId: verification.userId,
        type: 'VERIFICATION',
        message: parsed.data.action === 'approve'
          ? 'Your verification request has been approved.'
          : parsed.data.action === 'reject'
            ? `Your verification request was rejected.${parsed.data.notes ? ` Reason: ${parsed.data.notes}` : ''}`
            : 'More information is required for your verification request.',
      },
    });

    await tx.moderationAuditLog.create({
      data: {
        actorId: user.id,
        action: verificationReviewAuditAction(verification.type, parsed.data.action, Boolean(verification.propertyId)),
        entityType: 'Verification',
        entityId: verification.id,
        before: { status: verification.status, notes: verification.notes },
        after: { status: nextStatus, notes: parsed.data.notes ?? verification.notes },
        reason: parsed.data.notes ?? 'Verification reviewed by admin.',
      },
    });

    return result;
  });

  return NextResponse.json({
    data: {
      id: updated.id,
      type: updated.type,
      status: updated.status,
      notes: updated.notes,
      rejectionReason: updated.rejectionReason,
      reviewerId: updated.reviewerId,
      reviewedAt: updated.reviewedAt,
    },
  });
}
