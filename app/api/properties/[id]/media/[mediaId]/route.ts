import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { getCloudinaryConfig, getCloudinaryDeliveryType, signCloudinaryParams } from '@/lib/cloudinary';
import { canManagePropertyMedia, canSelectMediaAsCover, getCoverAfterMediaDeletion } from '@/lib/property-media-management';
import { prisma } from '@/lib/prisma';

async function lockProperty(transaction: Prisma.TransactionClient, propertyId: string) {
  await transaction.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${propertyId} FOR UPDATE`;
  return transaction.property.findUnique({
    where: { id: propertyId },
    select: { ownerId: true, agentId: true },
  });
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id: propertyId, mediaId } = await params;
  const result = await prisma.$transaction(async (transaction) => {
    const property = await lockProperty(transaction, propertyId);
    if (!property || !canManagePropertyMedia(user.id, property)) return { status: 403 as const };
    const media = await transaction.propertyMedia.findFirst({
      where: { id: mediaId, propertyId },
      select: { id: true, type: true },
    });
    if (!media || !canSelectMediaAsCover(media.type)) return { status: 404 as const };

    await transaction.propertyMedia.updateMany({ where: { propertyId }, data: { isCover: false } });
    await transaction.propertyMedia.update({ where: { id: mediaId }, data: { isCover: true } });
    return { status: 200 as const };
  });
  if (result.status !== 200) {
    return NextResponse.json({ error: result.status === 403 ? 'Forbidden.' : 'Image not found.' }, { status: result.status });
  }
  return NextResponse.json({ data: { id: mediaId, isCover: true } });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id: propertyId, mediaId } = await params;
  const initialProperty = await prisma.property.findUnique({
    where: { id: propertyId },
    select: { ownerId: true, agentId: true },
  });
  if (!initialProperty || !canManagePropertyMedia(user.id, initialProperty)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const media = await prisma.propertyMedia.findFirst({ where: { id: mediaId, propertyId } });
  if (!media) return NextResponse.json({ error: 'Media not found.' }, { status: 404 });

  if (media.publicId && media.resourceType) {
    try {
      const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const deliveryType = getCloudinaryDeliveryType(media.url);
      if (!deliveryType) return NextResponse.json({ error: 'Cloud storage delivery type is invalid.' }, { status: 502 });
      const signatureParams = { public_id: media.publicId, timestamp, ...(deliveryType === 'authenticated' ? { type: deliveryType } : {}) };
      const signature = signCloudinaryParams(signatureParams, apiSecret);
      const body = new FormData();
      body.set('public_id', media.publicId);
      body.set('timestamp', timestamp);
      body.set('api_key', apiKey);
      if (deliveryType === 'authenticated') body.set('type', deliveryType);
      body.set('signature', signature);
      const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(cloudName)}/${encodeURIComponent(media.resourceType)}/destroy`, { method: 'POST', body });
      const result = await response.json() as { result?: string };
      if (!response.ok || !['ok', 'not found'].includes(result.result ?? '')) {
        console.error(`Cloudinary media deletion failed with HTTP ${response.status}.`);
        return NextResponse.json({ error: 'Cloud storage could not delete this file.' }, { status: 502 });
      }
    } catch (error) {
      console.error('Cloudinary media deletion failed:', error);
      return NextResponse.json({ error: 'Cloud storage is not configured for media deletion.' }, { status: 503 });
    }
  }

  const deleted = await prisma.$transaction(async (transaction) => {
    const property = await lockProperty(transaction, propertyId);
    if (!property || !canManagePropertyMedia(user.id, property)) return 'forbidden' as const;
    const currentMedia = await transaction.propertyMedia.findFirst({ where: { id: mediaId, propertyId } });
    if (!currentMedia) return 'missing' as const;
    const remaining = await transaction.propertyMedia.findMany({
      where: { propertyId },
      select: { id: true, type: true, order: true, isCover: true },
    });
    const nextCoverId = getCoverAfterMediaDeletion(remaining, mediaId);
    await transaction.propertyMedia.delete({ where: { id: mediaId } });
    await transaction.propertyMedia.updateMany({ where: { propertyId }, data: { isCover: false } });
    if (nextCoverId) {
      await transaction.propertyMedia.update({ where: { id: nextCoverId }, data: { isCover: true } });
    }
    return 'deleted' as const;
  });
  if (deleted !== 'deleted') {
    return NextResponse.json({ error: deleted === 'forbidden' ? 'Forbidden.' : 'Media not found.' }, { status: deleted === 'forbidden' ? 403 : 404 });
  }
  return NextResponse.json({ data: { id: mediaId, deleted: true } });
}
