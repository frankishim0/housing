import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { getCloudinaryConfig, isCloudinaryUrl } from '@/lib/cloudinary';
import { prisma } from '@/lib/prisma';
import { canAccessPropertyDocument } from '@/lib/property-media-security';

const ALLOWED_DOCUMENT_TYPES = new Set([
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string; mediaId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const { id: propertyId, mediaId } = await params;
  const media = await prisma.propertyMedia.findFirst({
    where: { id: mediaId, propertyId, type: 'DOCUMENT' },
    include: { property: { select: { ownerId: true, agentId: true } } },
  });
  if (!media || !canAccessPropertyDocument(user, media.property)) {
    return NextResponse.json({ error: 'Document not found.' }, { status: 404 });
  }
  if (!media.publicId || media.resourceType !== 'raw' || !media.url) {
    return NextResponse.json({ error: 'Document storage details are incomplete.' }, { status: 410 });
  }

  let cloudName: string;
  try {
    ({ cloudName } = getCloudinaryConfig());
  } catch (error) {
    console.error('Property document access is not configured:', error);
    return NextResponse.json({ error: 'Document storage is not configured.' }, { status: 503 });
  }

  const deliveryType = media.url.includes('/raw/authenticated/') ? 'authenticated' : 'upload';
  if (!isCloudinaryUrl(media.url, cloudName, 'raw', media.publicId, deliveryType)) {
    return NextResponse.json({ error: 'Document storage location is invalid.' }, { status: 502 });
  }

  let upstream: Response;
  try {
    upstream = await fetch(media.url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(30_000) });
  } catch (error) {
    console.error('Property document retrieval failed:', error);
    return NextResponse.json({ error: 'The document could not be retrieved.' }, { status: 502 });
  }
  if (!upstream.ok || !upstream.body) {
    console.error(`Property document retrieval failed with HTTP ${upstream.status}.`);
    return NextResponse.json({ error: 'The document could not be retrieved.' }, { status: 502 });
  }
  const contentLengthHeader = upstream.headers.get('content-length');
  const contentLength = contentLengthHeader === null ? null : Number(contentLengthHeader);
  if (
    contentLength !== null
    && (!Number.isSafeInteger(contentLength) || contentLength > 25 * 1024 * 1024 || (media.size !== null && contentLength !== media.size))
  ) {
    await upstream.body.cancel();
    return NextResponse.json({ error: 'The stored document size is invalid.' }, { status: 502 });
  }

  const mimeType = media.mimeType && ALLOWED_DOCUMENT_TYPES.has(media.mimeType) ? media.mimeType : 'application/octet-stream';
  const fileName = (media.fileName ?? 'property-document').replace(/[\\/"\r\n\u0000-\u001f]/g, '_').replace(/[^\x20-\x7e]/g, '_');
  const disposition = mimeType === 'application/pdf' ? 'inline' : 'attachment';
  return new NextResponse(upstream.body, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `${disposition}; filename="${fileName}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
    },
  });
}
