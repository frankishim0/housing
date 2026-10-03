import { NextRequest, NextResponse } from 'next/server';
import { PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isOwnerStatusTransitionAllowed } from '@/lib/property-lifecycle';

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
      // Admins may publish directly; this is the moderation approval itself.
      nextStatus = PropertyStatus.PUBLISHED;
    } else if (isOwnerStatusTransitionAllowed(property.status, PropertyStatus.PENDING_REVIEW)) {
      // Owners/agents cannot go live directly; publishing requires moderation review.
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

  const updated = await prisma.property.update({
    where: { id: property.id },
    data: {
      status: nextStatus,
      publishedAt: nextStatus === PropertyStatus.PUBLISHED ? new Date() : null,
    },
  });
  return NextResponse.json({ data: updated });
}
