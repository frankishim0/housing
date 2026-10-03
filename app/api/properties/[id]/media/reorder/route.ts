import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { canManagePropertyMedia, getExistingCoverId, normalizeVisualMediaOrder, validateVisualMediaOrder } from '@/lib/property-media-management';
import { prisma } from '@/lib/prisma';

const requestSchema = z.object({ mediaIds: z.array(z.string().min(1)) }).strict();

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const body = requestSchema.safeParse(await request.json().catch(() => null));
  if (!body.success) return NextResponse.json({ error: 'Provide a valid media ID sequence.' }, { status: 400 });
  const { id: propertyId } = await params;
  const result = await prisma.$transaction(async (transaction) => {
    await transaction.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`;
    const property = await transaction.property.findUnique({
      where: { id: propertyId },
      select: { ownerId: true, agentId: true },
    });
    if (!property) return { status: 404 as const, error: 'Property not found.' };
    if (!canManagePropertyMedia(user.id, property)) return { status: 403 as const, error: 'Forbidden.' };

    const currentMedia = await transaction.propertyMedia.findMany({
      where: { propertyId, type: { in: ['IMAGE', 'VIDEO'] } },
      select: { id: true, type: true, order: true, isCover: true },
    });
    const validation = validateVisualMediaOrder(currentMedia, body.data.mediaIds);
    if (!validation.valid) return { status: 400 as const, error: validation.error };

    for (const { id: mediaId, order } of normalizeVisualMediaOrder(validation.mediaIds)) {
      await transaction.propertyMedia.update({ where: { id: mediaId }, data: { order } });
    }
    const coverId = getExistingCoverId(currentMedia);
    await transaction.propertyMedia.updateMany({ where: { propertyId }, data: { isCover: false } });
    if (coverId) await transaction.propertyMedia.update({ where: { id: coverId }, data: { isCover: true } });
    return { status: 200 as const };
  });

  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ data: { mediaIds: body.data.mediaIds } });
}
