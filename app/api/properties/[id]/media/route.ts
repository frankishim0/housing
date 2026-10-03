import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { verifyCloudinaryUpload, verifyUploadTicket } from '@/lib/cloudinary';
import { attachPropertyMedia } from '@/lib/property-media-attach';
import { getCoverAfterMediaAddition, getNextVisualMediaOrder } from '@/lib/property-media-management';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const result = await attachPropertyMedia(
    {
      getUser: getSessionUser,
      findProperty: (id) => prisma.property.findUnique({ where: { id }, select: { id: true, ownerId: true, agentId: true } }),
      verifyTicket: verifyUploadTicket,
      verifyUpload: verifyCloudinaryUpload,
      createMedia: (data) => prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`;
        const currentMedia = await transaction.propertyMedia.findMany({
          where: { propertyId },
          select: { id: true, type: true, order: true, isCover: true },
        });
        const order = data.type === 'DOCUMENT'
          ? currentMedia.reduce((maximum, item) => Math.max(maximum, item.order), -1) + 1
          : getNextVisualMediaOrder(currentMedia);
        const created = await transaction.propertyMedia.create({ data: { ...data, order } });
        const coverId = getCoverAfterMediaAddition(currentMedia, { id: created.id, type: created.type });
        await transaction.propertyMedia.updateMany({ where: { propertyId }, data: { isCover: false } });
        if (coverId) await transaction.propertyMedia.update({ where: { id: coverId }, data: { isCover: true } });
        return created;
      }),
    },
    propertyId,
    await request.json().catch(() => null),
  );
  return NextResponse.json(result.body, { status: result.status });
}
