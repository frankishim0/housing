import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';

async function authorize(propertyId: string, userId: string) {
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { ownerId: true, agentId: true } });
  return Boolean(property && [property.ownerId, property.agentId].includes(userId));
}

export async function PATCH(_request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id, mediaId } = await params;
  if (!await authorize(id, user.id)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const media = await prisma.propertyMedia.findFirst({ where: { id: mediaId, propertyId: id, type: 'IMAGE' }, select: { id: true } });
  if (!media) return NextResponse.json({ error: 'Image not found.' }, { status: 404 });
  await prisma.$transaction([
    prisma.propertyMedia.updateMany({ where: { propertyId: id, type: 'IMAGE' }, data: { isCover: false } }),
    prisma.propertyMedia.update({ where: { id: mediaId }, data: { isCover: true } }),
  ]);
  return NextResponse.json({ data: { id: mediaId, isCover: true } });
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id, mediaId } = await params;
  if (!await authorize(id, user.id)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const media = await prisma.propertyMedia.findFirst({ where: { id: mediaId, propertyId: id } });
  if (!media) return NextResponse.json({ error: 'Media not found.' }, { status: 404 });

  if (media.publicId && media.resourceType) {
    try {
      const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
      const timestamp = Math.floor(Date.now() / 1000).toString();
      const signature = signCloudinaryParams({ public_id: media.publicId, timestamp }, apiSecret);
      const body = new FormData();
      body.set('public_id', media.publicId);
      body.set('timestamp', timestamp);
      body.set('api_key', apiKey);
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

  await prisma.propertyMedia.delete({ where: { id: mediaId } });
  return NextResponse.json({ data: { id: mediaId, deleted: true } });
}
