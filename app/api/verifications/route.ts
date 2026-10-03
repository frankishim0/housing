import { NextRequest, NextResponse } from 'next/server';
import { Prisma, UserRole, UserVerificationStatus, VerificationStatus } from '@prisma/client';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { classifyUpload, getCloudinaryUploadDetails, verifyCloudinaryUpload, verifyUploadTicket } from '@/lib/cloudinary';
import { canSubmitPropertyVerification, isProfessionalRole, isVerificationType, logModerationAction, verificationSubmissionAuditAction } from '@/lib/verification';

const documentSchema = z.object({
  ticket: z.string().min(1),
  fileName: z.string().min(1).max(180),
  mimeType: z.string().max(120),
  size: z.number().int().positive(),
  secureUrl: z.url().startsWith('https://'),
  publicId: z.string().min(1).max(500),
  resourceType: z.enum(['image', 'video', 'raw']),
});

const submissionSchema = z.object({
  type: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  notes: z.string().trim().max(4000).optional(),
  details: z.string().trim().max(4000).optional(),
  documents: z.array(documentSchema).max(10).default([]),
}).refine((value) => isVerificationType(value.type), 'Choose a valid verification type.');

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const verifications = await prisma.verification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    include: { property: { select: { id: true, title: true, slug: true, verified: true, verifiedAt: true } } },
  });
  return NextResponse.json({
    data: verifications.map((item) => ({
      ...item,
      documentCount: Array.isArray(item.documents) ? item.documents.length : 0,
      documents: undefined,
      documentUrl: undefined,
    })),
  });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = submissionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  if (!isVerificationType(parsed.data.type)) {
    return NextResponse.json({ error: 'Choose a valid verification type.' }, { status: 400 });
  }

  const professionalTypes = ['PROFESSIONAL', 'AGENCY', 'COMPANY'];
  if (professionalTypes.includes(parsed.data.type) && !isProfessionalRole(user.role)) {
    return NextResponse.json({ error: 'This verification type is only available to property professionals.' }, { status: 403 });
  }
  if (parsed.data.type === 'PROPERTY_OWNERSHIP' && !parsed.data.propertyId) {
    return NextResponse.json({ error: 'Property ownership verification requires a property.' }, { status: 400 });
  }
  if (parsed.data.type !== 'PROPERTY_OWNERSHIP' && parsed.data.propertyId) {
    return NextResponse.json({ error: 'Only property ownership verification can be linked to a property.' }, { status: 400 });
  }

  if (parsed.data.propertyId) {
    const property = await prisma.property.findUnique({
      where: { id: parsed.data.propertyId },
      select: { id: true, ownerId: true, agentId: true, title: true },
    });
    if (!property || !canSubmitPropertyVerification(user, property)) {
      return NextResponse.json({ error: 'Only the property owner or assigned agent can submit verification for this listing.' }, { status: 403 });
    }
  } else if (isProfessionalRole(user.role) && parsed.data.type === 'PROPERTY_OWNERSHIP') {
    return NextResponse.json({ error: 'Property ownership verification requires a property.' }, { status: 400 });
  }

  const active = await prisma.verification.findFirst({
    where: {
      userId: user.id,
      type: parsed.data.type,
      status: VerificationStatus.PENDING,
      ...(parsed.data.propertyId ? { propertyId: parsed.data.propertyId } : { propertyId: null }),
    },
    select: { id: true },
  });
  if (active) {
    return NextResponse.json({ error: 'You already have an active verification request of this type.' }, { status: 409 });
  }

  let processedDocuments: {
    fileName: string;
    mimeType: string;
    size: number;
    publicId: string;
    resourceType: 'image' | 'video' | 'raw';
    deliveryType: 'authenticated';
    format: string;
  }[];
  try {
    processedDocuments = await Promise.all(parsed.data.documents.map(async (document) => {
      const ticket = verifyUploadTicket(document.ticket, {
        userId: user.id,
        purpose: parsed.data.propertyId
          ? { kind: 'verification', verificationType: parsed.data.type, propertyId: parsed.data.propertyId }
          : { kind: 'verification', verificationType: parsed.data.type },
      });
      const file = classifyUpload(document.mimeType);
      if (!ticket || ticket.deliveryType !== 'authenticated' || !file || file.resourceType === 'video' || ticket.publicId !== document.publicId || ticket.resourceType !== document.resourceType || ticket.mimeType !== document.mimeType || document.size > file.maxBytes) {
        throw new Error('One of the verification documents is invalid or expired.');
      }
      const verified = await verifyCloudinaryUpload({ ...document, deliveryType: 'authenticated' });
      if (!verified) throw new Error('One of the verification documents could not be verified against Cloudinary.');
      const details = await getCloudinaryUploadDetails(document.publicId, document.resourceType, 'authenticated');
      if (!details?.format) throw new Error('Verification document metadata is unavailable.');
      return {
        fileName: document.fileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_'),
        mimeType: document.mimeType,
        size: document.size,
        publicId: document.publicId,
        resourceType: document.resourceType,
        deliveryType: 'authenticated',
        format: details.format,
      };
    }));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Unable to process verification documents.',
    }, { status: 400 });
  }

  try {
    const verification = await prisma.$transaction(async (tx) => {
      const created = await tx.verification.create({
        data: {
          userId: user.id,
          propertyId: parsed.data.propertyId ?? null,
          type: parsed.data.type,
          status: VerificationStatus.PENDING,
          notes: parsed.data.notes ?? parsed.data.details ?? null,
          documentUrl: null,
          documents: processedDocuments as Prisma.InputJsonValue,
          metadata: {
            submittedByRole: user.role,
            requiresAdminReview: true,
          } as Prisma.InputJsonValue,
        },
      });
      if (parsed.data.type === 'IDENTITY') {
        await tx.user.update({
          where: { id: user.id },
          data: {
            verificationStatus: UserVerificationStatus.PENDING,
            verificationReviewedAt: null,
            verificationReviewedById: null,
          },
        });
      }
      await tx.notification.createMany({
        data: await tx.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } }).then((admins) => admins.map((admin) => ({
          userId: admin.id,
          type: 'VERIFICATION',
          message: `${user.name} submitted a ${parsed.data.type.toLowerCase().replace(/_/g, ' ')} verification request.`,
        }))),
      });
      await logModerationAction({
        client: tx,
        actorId: user.id,
        action: verificationSubmissionAuditAction(parsed.data.type, Boolean(parsed.data.propertyId)),
        entityType: 'Verification',
        entityId: created.id,
        after: { type: parsed.data.type, propertyId: parsed.data.propertyId ?? null },
        reason: parsed.data.notes ?? 'Verification request submitted',
      });
      return created;
    });
    return NextResponse.json({ data: verification }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'An active verification request of this type already exists.' }, { status: 409 });
    }
    console.error('Verification request could not be saved:', error);
    return NextResponse.json({ error: 'Unable to create verification request.' }, { status: 500 });
  }
}
