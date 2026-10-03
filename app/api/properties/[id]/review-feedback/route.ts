import { ModerationAuditAction, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { canAccessListingReviewFeedback } from '@/lib/listing-review';
import { prisma } from '@/lib/prisma';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const property = await prisma.property.findUnique({
    where: { id: (await params).id },
    select: { id: true, ownerId: true, agentId: true, status: true },
  });
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  if (!canAccessListingReviewFeedback(user, property)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const latestRejection = await prisma.moderationAuditLog.findFirst({
    where: {
      entityType: 'Property',
      entityId: property.id,
      action: ModerationAuditAction.PROPERTY_REVIEW_REJECTED,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      reason: true,
      createdAt: true,
      actor: { select: { id: true, name: true, role: true } },
    },
  });

  return NextResponse.json({
    data: {
      propertyId: property.id,
      status: property.status,
      latestRejectionReason: latestRejection?.reason ?? null,
      rejectedAt: latestRejection?.createdAt.toISOString() ?? null,
      reviewer: user.role === UserRole.ADMIN && latestRejection?.actor
        ? { id: latestRejection.actor.id, name: latestRejection.actor.name, role: latestRejection.actor.role }
        : null,
    },
  });
}
