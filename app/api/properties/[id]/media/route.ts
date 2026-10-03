import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { verifyCloudinaryUpload, verifyUploadTicket } from '@/lib/cloudinary';
import { attachPropertyMedia } from '@/lib/property-media-attach';
import { prisma } from '@/lib/prisma';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: propertyId } = await params;
  const result = await attachPropertyMedia(
    {
      getUser: getSessionUser,
      findProperty: (id) => prisma.property.findUnique({ where: { id }, select: { id: true, ownerId: true, agentId: true } }),
      verifyTicket: verifyUploadTicket,
      verifyUpload: verifyCloudinaryUpload,
      countMedia: (id) => prisma.propertyMedia.count({ where: { propertyId: id } }),
      createMedia: (data) => prisma.propertyMedia.create({ data }),
    },
    propertyId,
    await request.json().catch(() => null),
  );
  return NextResponse.json(result.body, { status: result.status });
}
