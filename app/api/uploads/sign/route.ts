import crypto from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { classifyUpload, createUploadTicket, getCloudinaryConfig, signCloudinaryParams } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';
import { canSubmitPropertyVerification } from '@/lib/verification';

const schema = z.object({
  purpose: z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('property'), propertyId: z.string().min(1) }),
    z.object({ kind: z.literal('message'), conversationId: z.string().min(1) }),
    z.object({ kind: z.literal('verification'), verificationType: z.string().min(1), propertyId: z.string().min(1).optional() }),
  ]),
  fileName: z.string().trim().min(1).max(240),
  mimeType: z.string().trim().max(120),
  size: z.number().int().positive(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const file = classifyUpload(parsed.data.mimeType);
  if (!file || (parsed.data.purpose.kind === 'verification' && file.resourceType === 'video') || parsed.data.size > file.maxBytes) {
    return NextResponse.json({ error: 'Unsupported file type or file exceeds the upload size limit.' }, { status: 400 });
  }

  if (parsed.data.purpose.kind === 'property') {
    const property = await prisma.property.findUnique({
      where: { id: parsed.data.purpose.propertyId },
      select: { ownerId: true, agentId: true },
    });
    if (!property || ![property.ownerId, property.agentId].includes(user.id)) {
      return NextResponse.json({ error: 'Only the property owner or assigned agent can upload listing media.' }, { status: 403 });
    }
  } else if (parsed.data.purpose.kind === 'message') {
    const participant = await prisma.conversationParticipant.findUnique({
      where: { conversationId_userId: { conversationId: parsed.data.purpose.conversationId, userId: user.id } },
      select: { userId: true },
    });
    if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  } else if (parsed.data.purpose.kind === 'verification') {
    if (parsed.data.purpose.propertyId) {
      const property = await prisma.property.findUnique({
        where: { id: parsed.data.purpose.propertyId },
        select: { ownerId: true, agentId: true },
      });
      if (!property || !canSubmitPropertyVerification(user, property)) {
        return NextResponse.json({ error: 'Only authorized owners or agents can upload verification documents for this property.' }, { status: 403 });
      }
    }
  }

  try {
    const { cloudName, apiKey, apiSecret } = getCloudinaryConfig();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const folder = parsed.data.purpose.kind === 'property'
      ? `housing/properties/${parsed.data.purpose.propertyId}`
      : parsed.data.purpose.kind === 'message'
        ? `housing/messages/${parsed.data.purpose.conversationId}/${user.id}`
        : `housing/verifications/${user.id}/${parsed.data.purpose.verificationType}${parsed.data.purpose.propertyId ? `/${parsed.data.purpose.propertyId}` : ''}`;
    const folderName = folder;
    const deliveryType: 'upload' | 'authenticated' = parsed.data.purpose.kind === 'verification' ? 'authenticated' : 'upload';
    const publicId = `${folderName}/${crypto.randomUUID()}`;
    const signedParams = {
      folder: folderName,
      overwrite: 'false',
      public_id: publicId,
      timestamp,
      ...(deliveryType === 'authenticated' ? { type: deliveryType } : {}),
    };
    const ticket = createUploadTicket({
      userId: user.id,
      purpose: parsed.data.purpose,
      publicId,
      resourceType: file.resourceType,
      mimeType: parsed.data.mimeType,
      deliveryType,
      expiresAt: Date.now() + 10 * 60 * 1000,
    });
    return NextResponse.json({
      data: {
        cloudName,
        apiKey,
        resourceType: file.resourceType,
        deliveryType,
        timestamp: Number(timestamp),
        folder: folderName,
        publicId,
        signature: signCloudinaryParams(signedParams, apiSecret),
        ticket,
        maxBytes: file.maxBytes,
      },
    });
  } catch (error) {
    console.error('Cloudinary upload signing failed:', error);
    return NextResponse.json({ error: 'Media upload is not configured.' }, { status: 503 });
  }
}
