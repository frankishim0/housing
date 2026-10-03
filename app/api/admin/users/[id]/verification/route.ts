import { NextRequest, NextResponse } from 'next/server';
import { ModerationAuditAction, UserRole, UserVerificationStatus, VerificationStatus } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logModerationAction } from '@/lib/verification';
import { notifyUsersSafely } from '@/lib/notifications';
import { z } from 'zod';

const schema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED']),
  reason: z.string().trim().max(4000).optional(),
}).refine((value) => value.status !== 'REJECTED' || Boolean(value.reason), 'A rejection reason is required.');

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required.' : 'Admin role required.' }, { status: unauthenticated ? 401 : 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, verificationStatus: true },
  });
  if (!existing) return NextResponse.json({ error: 'User not found.' }, { status: 404 });

  const reviewedAt = new Date();
  const status: UserVerificationStatus = parsed.data.status;
  const verificationStatus: VerificationStatus = parsed.data.status;
  const action = status === UserVerificationStatus.VERIFIED
    ? ModerationAuditAction.USER_VERIFICATION_APPROVED
    : status === UserVerificationStatus.REJECTED
      ? ModerationAuditAction.USER_VERIFICATION_REJECTED
      : ModerationAuditAction.USER_VERIFICATION_INFO_REQUESTED;

  const user = await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({
      where: { id },
      data: {
        verificationStatus: status,
        verificationReviewedAt: reviewedAt,
        verificationReviewedById: admin.id,
      },
      select: { id: true, name: true, role: true, verificationStatus: true },
    });
    const activeRequest = await tx.verification.findFirst({
      where: { userId: id, propertyId: null, type: 'IDENTITY', status: VerificationStatus.PENDING },
      select: { id: true },
    });
    if (activeRequest) {
      await tx.verification.update({
        where: { id: activeRequest.id },
        data: {
          status: verificationStatus,
          reviewerId: admin.id,
          reviewedAt,
          rejectionReason: status === UserVerificationStatus.REJECTED ? parsed.data.reason : null,
        },
      });
    } else {
      await tx.verification.create({
        data: {
          userId: id,
          type: 'IDENTITY',
          status: verificationStatus,
          reviewerId: admin.id,
          reviewedAt,
          notes: parsed.data.reason ?? null,
          rejectionReason: status === UserVerificationStatus.REJECTED ? parsed.data.reason : null,
        },
      });
    }
    await logModerationAction({
      client: tx,
      actorId: admin.id,
      action,
      entityType: 'User',
      entityId: id,
      before: { verificationStatus: existing.verificationStatus },
      after: { verificationStatus: status, verificationReviewedAt: reviewedAt.toISOString() },
      reason: parsed.data.reason ?? 'Identity verification reviewed by admin.',
    });
    return updated;
  });
  await notifyUsersSafely({
    userIds: [id],
    type: 'VERIFICATION',
    message: status === UserVerificationStatus.VERIFIED
      ? 'Your identity verification has been approved.'
      : status === UserVerificationStatus.REJECTED
        ? 'Your identity verification was rejected. Review the private feedback in your verification dashboard.'
        : 'More information is required for your identity verification.',
    eventName: 'notification',
    eventData: { verificationStatus: user.verificationStatus },
  });
  return NextResponse.json({ data: user });
}
