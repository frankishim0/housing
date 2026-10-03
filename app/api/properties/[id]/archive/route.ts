import { NextRequest, NextResponse } from 'next/server';
import { PropertyStatus } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { canEditListing } from '@/lib/listing-edit';
import { canArchiveListing, canRestoreListing } from '@/lib/listing-archive';
import { prisma } from '@/lib/prisma';
import { notifyUsersSafely } from '@/lib/notifications';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || typeof body.archived !== 'boolean') {
    return NextResponse.json({ error: 'Provide an archived boolean.' }, { status: 400 });
  }

  const propertyId = (await params).id;
  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`;
    const property = await tx.property.findUnique({ where: { id: propertyId }, select: { id: true, title: true, ownerId: true, agentId: true, status: true } });
    if (!property) return { error: 'Property not found.', status: 404 as const };
    if (!canEditListing(user, property)) return { error: 'Forbidden.', status: 403 as const };

    if (body.archived) {
      if (!canArchiveListing(property.status)) {
        return { error: 'This listing cannot be archived from its current status. Pause or return it to draft first.', status: 409 as const };
      }
    } else if (!canRestoreListing(property.status)) {
      return { error: 'Only archived listings can be restored.', status: 409 as const };
    }

    const updated = await tx.property.update({
      where: { id: property.id },
      data: body.archived
        ? { status: PropertyStatus.ARCHIVED, publishedAt: null }
        : { status: PropertyStatus.DRAFT, publishedAt: null },
      select: { id: true, status: true },
    });
    return {
      data: updated,
      title: property.title,
      ownerId: property.ownerId,
      agentId: property.agentId,
      status: 200 as const,
    };
  });

  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  const archived = result.data.status === PropertyStatus.ARCHIVED;
  await notifyUsersSafely({
    userIds: [result.ownerId, ...(result.agentId ? [result.agentId] : [])],
    type: 'PROPERTY',
    message: archived
      ? `Your property "${result.title}" was archived.`
      : `Your property "${result.title}" was restored to draft.`,
    eventName: 'notification',
    eventData: { propertyId: result.data.id, status: result.data.status },
  });
  return NextResponse.json({ data: result.data });
}
