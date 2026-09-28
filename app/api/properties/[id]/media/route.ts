import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { classifyUpload, verifyCloudinaryUpload, verifyUploadTicket } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';

const schema = z.object({
  ticket: z.string().min(1),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(120),
  size: z.number().int().positive(),
  secureUrl: z.url().startsWith('https://'),
  publicId: z.string().min(1).max(500),
  resourceType: z.enum(['image', 'video', 'raw']),
});

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id: propertyId } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true, ownerId: true, agentId: true } });
  if (!property || ![property.ownerId, property.agentId].includes(user.id)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const purpose = { kind: 'property' as const, propertyId };
  const ticket = verifyUploadTicket(parsed.data.ticket, { userId: user.id, purpose });
  const file = classifyUpload(parsed.data.mimeType);
  if (!ticket || !file || parsed.data.size > file.maxBytes || ticket.publicId !== parsed.data.publicId || ticket.mimeType !== parsed.data.mimeType || ticket.resourceType !== parsed.data.resourceType) {
    return NextResponse.json({ error: 'The upload authorization is invalid or expired.' }, { status: 400 });
  }

  if (!await verifyCloudinaryUpload(parsed.data)) {
    return NextResponse.json({ error: 'The uploaded file could not be verified against the configured media account.' }, { status: 400 });
  }
  const media = await prisma.propertyMedia.create({
    data: {
      propertyId,
      url: parsed.data.secureUrl,
      type: file.mediaType,
      fileName: parsed.data.fileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_'),
      mimeType: parsed.data.mimeType,
      size: parsed.data.size,
      publicId: parsed.data.publicId,
      resourceType: parsed.data.resourceType,
      order: await prisma.propertyMedia.count({ where: { propertyId } }),
    },
  });
  return NextResponse.json({ data: media }, { status: 201 });
}
