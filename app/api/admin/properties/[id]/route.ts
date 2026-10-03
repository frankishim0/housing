import { NextRequest, NextResponse } from 'next/server';
import { ModerationAuditAction, PropertyStatus, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { normalizeRejectionReason, adminPropertyReviewSchema } from '@/lib/listing-review';
import { logModerationAction } from '@/lib/verification';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Authentication required.' : 'Admin role required.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 });
  }

  const parsed = adminPropertyReviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const propertyId = (await params).id;
  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      title: true,
      ownerId: true,
      agentId: true,
      status: true,
      verified: true,
      verifiedAt: true,
    },
  });
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

  const reason = normalizeRejectionReason(parsed.data.reason ?? null);
  const nextStatus = parsed.data.status as PropertyStatus;
  const updated = await prisma.$transaction(async (tx) => {
    const updatedProperty = await tx.property.update({
      where: { id: property.id },
      data: {
        status: nextStatus,
        verified: nextStatus === PropertyStatus.REJECTED ? false : property.verified,
        verifiedAt: nextStatus === PropertyStatus.REJECTED ? null : property.verifiedAt,
        publishedAt: nextStatus === PropertyStatus.PUBLISHED ? new Date() : null,
      },
    });

    if (nextStatus === PropertyStatus.REJECTED) {
      await logModerationAction({
        client: tx,
        actorId: admin.id,
        action: ModerationAuditAction.PROPERTY_REVIEW_REJECTED,
        entityType: 'Property',
        entityId: property.id,
        before: { status: property.status },
        after: { status: nextStatus, verified: false, verifiedAt: null },
        reason: reason ?? 'Listing rejected by admin review.',
      });
      const notificationMessages = [
        { userId: property.ownerId, type: 'PROPERTY' as const, message: `Your property "${property.title}" was rejected. Reason: ${reason ?? 'No specific reason provided.'}` },
      ];
      if (property.agentId) notificationMessages.push({ userId: property.agentId, type: 'PROPERTY' as const, message: `The property "${property.title}" was rejected. Reason: ${reason ?? 'No specific reason provided.'}` });
      await tx.notification.createMany({ data: notificationMessages });
    } else {
      await tx.notification.create({
        data: {
          userId: property.ownerId,
          type: 'PROPERTY',
          message: `Your property "${property.title}" is now ${nextStatus.toLowerCase().replace(/_/g, ' ')}.`,
        },
      });
    }

    return updatedProperty;
  });

  return NextResponse.json({ data: updated });
}
