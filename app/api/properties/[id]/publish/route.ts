import { NextRequest, NextResponse } from 'next/server';
import { ModerationAuditAction, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isOwnerStatusTransitionAllowed } from '@/lib/property-lifecycle';
import { logModerationAction } from '@/lib/verification';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const property = await prisma.property.findUnique({ where: { id: (await params).id } });
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  const isAdmin = user.role === UserRole.ADMIN;
  if (!isAdmin && property.ownerId !== user.id && property.agentId !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.published !== 'boolean') {
    return NextResponse.json({ error: 'Provide a published boolean.' }, { status: 400 });
  }

  let nextStatus: PropertyStatus;
  if (body.published) {
    if (isAdmin) {
      nextStatus = PropertyStatus.PUBLISHED;
    } else if (isOwnerStatusTransitionAllowed(property.status, PropertyStatus.PENDING_REVIEW)) {
      nextStatus = PropertyStatus.PENDING_REVIEW;
    } else {
      return NextResponse.json({ error: 'This listing cannot be submitted for review from its current status.' }, { status: 403 });
    }
  } else {
    if (property.status !== PropertyStatus.PUBLISHED) {
      return NextResponse.json({ error: 'Only a published listing can be paused.' }, { status: 403 });
    }
    nextStatus = PropertyStatus.PAUSED;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const nextProperty = await tx.property.update({
      where: { id: property.id },
      data: {
        status: nextStatus,
        publishedAt: nextStatus === PropertyStatus.PUBLISHED ? new Date() : null,
      },
    });
    if (!isAdmin && nextStatus === PropertyStatus.PENDING_REVIEW) {
      await logModerationAction({
        client: tx,
        actorId: user.id,
        action: ModerationAuditAction.PROPERTY_REVIEW_SUBMITTED,
        entityType: 'Property',
        entityId: property.id,
        before: { status: property.status },
        after: { status: nextStatus },
        reason: 'Owner or agent submitted listing for review.',
      });
      await tx.notification.create({
        data: {
          userId: user.id,
          type: 'PROPERTY',
          message: 'Your listing has been submitted for review.',
        },
      });
      await tx.notification.createMany({
        data: await tx.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } }).then((admins) => admins.map((admin) => ({
          userId: admin.id,
          type: 'MODERATION',
          message: `${user.name} submitted "${property.title}" for listing review.`,
        }))),
      });
    }
    return nextProperty;
  });
  return NextResponse.json({ data: updated });
}
