import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canViewVerification } from '@/lib/verification';
import { createAuthenticatedCloudinaryUrl } from '@/lib/cloudinary';

export async function GET(_request: NextRequest, context: RouteContext<'/api/verifications/[id]/documents/[index]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id, index } = await context.params;
  const verification = await prisma.verification.findUnique({
    where: { id },
    select: { id: true, userId: true, propertyId: true, reviewerId: true, documents: true },
  });
  if (!verification) return NextResponse.json({ error: 'Verification not found.' }, { status: 404 });
  if (!canViewVerification(user, verification)) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const documents = Array.isArray(verification.documents) ? verification.documents : [];
  const documentIndex = Number(index);
  if (!Number.isSafeInteger(documentIndex) || documentIndex < 0) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  const document = documents[documentIndex];
  if (!document || typeof document !== 'object' || document === null) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  const fields = document as {
    publicId?: unknown;
    resourceType?: unknown;
    deliveryType?: unknown;
    format?: unknown;
    mimeType?: unknown;
    fileName?: unknown;
  };
  if (
    typeof fields.publicId !== 'string'
    || !['image', 'video', 'raw'].includes(String(fields.resourceType))
    || fields.deliveryType !== 'authenticated'
    || typeof fields.format !== 'string'
    || typeof fields.mimeType !== 'string'
    || typeof fields.fileName !== 'string'
  ) {
    return NextResponse.json({ error: 'Document is unavailable.' }, { status: 404 });
  }
  const upstream = await fetch(createAuthenticatedCloudinaryUrl({
    publicId: fields.publicId,
    resourceType: fields.resourceType as 'image' | 'video' | 'raw',
    format: fields.format,
  }), { cache: 'no-store', redirect: 'error' });
  if (!upstream.ok || !upstream.body) {
    console.error(`Authenticated verification document fetch failed with HTTP ${upstream.status}.`);
    return NextResponse.json({ error: 'Document could not be retrieved.' }, { status: 502 });
  }
  const safeFileName = fields.fileName.replace(/["\\\r\n]/g, '_');
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': fields.mimeType,
      'Content-Disposition': `attachment; filename="${safeFileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
