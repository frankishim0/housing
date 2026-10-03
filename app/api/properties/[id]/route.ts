import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { toSlug, upsertLocationHierarchy } from '@/lib/location';
import { notifySavedPropertyUsers } from '@/lib/notifications';
import { propertyUpdateSchema } from '@/lib/validation';
import { canViewNonPublicProperty, isOwnerStatusTransitionAllowed, isPubliclyVisibleStatus, shouldInvalidateVerification } from '@/lib/property-lifecycle';
import { canEditListing } from '@/lib/listing-edit';
import { excludePrivateDocumentUrls } from '@/lib/property-media-security';
import { getDeletionBlockers } from '@/lib/listing-archive';
import { destroyCloudinaryAsset } from '@/lib/cloudinary';

function serialized<T extends { price: Prisma.Decimal | unknown; size: Prisma.Decimal | unknown }>(property: T) {
  return { ...property, price: Number(property.price), size: Number(property.size) };
}

async function findProperty(id: string) {
  return prisma.property.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      location: true,
      media: { where: { type: { not: 'DOCUMENT' } }, orderBy: [{ order: 'asc' }, { id: 'asc' }] },
      amenities: true,
      owner: { select: { id: true, name: true, profileImage: true, role: true, verificationStatus: true } },
      agent: { select: { id: true, name: true, profileImage: true, role: true, verificationStatus: true } },
    },
  });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const property = await findProperty((await params).id);
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  if (!isPubliclyVisibleStatus(property.status)) {
    const user = await getSessionUser();
    if (!canViewNonPublicProperty(user, property)) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
  }
  const location = property.location.hideExactAddress ? {
    ...property.location,
    address: [property.location.area, property.location.city, property.location.state, property.location.country].filter(Boolean).join(', '),
    latitude: property.location.latitude === null ? null : Math.round(property.location.latitude * 100) / 100,
    longitude: property.location.longitude === null ? null : Math.round(property.location.longitude * 100) / 100,
  } : property.location;
  return NextResponse.json({ data: excludePrivateDocumentUrls(serialized({ ...property, location })) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !([UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER, UserRole.ADMIN] as UserRole[]).includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: user ? 403 : 401 });
  }

  const property = await findProperty((await params).id);
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  const isAdmin = user.role === UserRole.ADMIN;
  if (!canEditListing(user, property)) {
    return NextResponse.json({ error: 'You do not own this property.' }, { status: 403 });
  }

  const rawBody = await request.json().catch(() => null);
  if (!rawBody || typeof rawBody !== 'object') return NextResponse.json({ error: 'Invalid listing details.' }, { status: 400 });
  const parsed = propertyUpdateSchema.safeParse(rawBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { status: requestedStatus, ...fields } = parsed.data;

  if (requestedStatus !== undefined && !isAdmin && !isOwnerStatusTransitionAllowed(property.status, requestedStatus)) {
    return NextResponse.json({
      error: requestedStatus === PropertyStatus.PUBLISHED
        ? 'Only platform moderation can publish a listing. Submit it for review instead.'
        : 'This status change is not permitted from the listing\u2019s current status.',
    }, { status: 403 });
  }

  const data: Prisma.PropertyUpdateInput = {};
  for (const field of ['title', 'description', 'bedrooms', 'bathrooms', 'size', 'parkingSpaces', 'yearBuilt', 'listingType', 'sizeUnit', 'furnished', 'hasPool', 'hasSecurity', 'luxury', 'price'] as const) {
    if (fields[field] !== undefined) data[field] = fields[field] as never;
  }
  if (fields.type !== undefined) {
    const name = fields.type;
    const code = toSlug(name);
    const propertyType = await prisma.propertyType.upsert({
      where: { code },
      create: { id: `property-type-${code}`, code, name },
      update: { name },
    });
    data.type = name;
    data.propertyType = { connect: { id: propertyType.id } };
  }
  if (fields.amenities !== undefined) {
    data.amenities = {
      deleteMany: {},
      create: fields.amenities.map((name) => ({ name })),
    };
  }
  if (requestedStatus !== undefined) {
    data.status = requestedStatus;
    data.publishedAt = requestedStatus === PropertyStatus.PUBLISHED ? new Date() : null;
  }
  if (shouldInvalidateVerification([
    ...Object.keys(fields),
    ...(fields.location ? ['location'] : []),
    ...(fields.amenities ? ['amenities'] : []),
  ], property.verified)) {
    data.verified = false;
    data.verifiedAt = null;
  }

  const updated = await prisma.$transaction(async (transaction) => {
    if (fields.location !== undefined) {
      const location = fields.location;
      const locationData = await upsertLocationHierarchy(transaction, {
        countryCode: location.countryCode,
        region: location.region,
        city: location.city,
        neighborhood: location.neighborhood,
        postalCode: location.postalCode,
        address: location.address,
        latitude: location.latitude ?? undefined,
        longitude: location.longitude ?? undefined,
        hideExactAddress: location.hideExactAddress ?? false,
      });
      const locationRecord = await transaction.location.create({ data: locationData, select: { id: true } });
      data.location = { connect: { id: locationRecord.id } };
    }
    return transaction.property.update({
      where: { id: property.id },
      data,
      include: { location: true, media: true, amenities: true },
    });
  });
  await notifySavedPropertyUsers(property.id, `A property you saved has updated details or availability: ${updated.title}.`, user.id);
  return NextResponse.json({ data: serialized(updated) });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const lookup = (await params).id;

  const result = await prisma.$transaction(async (tx) => {
    const found = await tx.property.findFirst({ where: { OR: [{ id: lookup }, { slug: lookup }] }, select: { id: true } });
    if (!found) return { error: 'Property not found.', status: 404 as const };
    await tx.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${found.id} FOR UPDATE`;
    const property = await tx.property.findUnique({
      where: { id: found.id },
      select: {
        id: true, ownerId: true, agentId: true, status: true,
        media: { select: { url: true, publicId: true, resourceType: true } },
      },
    });
    if (!property) return { error: 'Property not found.', status: 404 as const };
    if (user.role !== UserRole.ADMIN && property.ownerId !== user.id && property.agentId !== user.id) {
      return { error: 'Forbidden.', status: 403 as const };
    }

    const [payments, transactions, viewings, conversations, enquiries, callSessions, featuredListings, tenants, verifications, reports, reviews, auditLogs, financialAudits] = await Promise.all([
      tx.payment.count({ where: { propertyId: property.id } }),
      tx.financialTransaction.count({ where: { propertyId: property.id } }),
      tx.viewing.count({ where: { propertyId: property.id } }),
      tx.conversation.count({ where: { propertyId: property.id } }),
      tx.enquiry.count({ where: { propertyId: property.id } }),
      tx.callSession.count({ where: { propertyId: property.id } }),
      tx.featuredListing.count({ where: { propertyId: property.id } }),
      tx.tenant.count({ where: { propertyId: property.id } }),
      tx.verification.count({ where: { propertyId: property.id } }),
      tx.report.count({ where: { propertyId: property.id } }),
      tx.review.count({ where: { propertyId: property.id } }),
      tx.moderationAuditLog.count({ where: { entityType: 'Property', entityId: property.id } }),
      tx.financialAuditLog.count({ where: { entityType: 'Property', entityId: property.id } }),
    ]);
    const blockers = getDeletionBlockers(property.status, {
      payments, transactions, viewings, conversations, enquiries, callSessions, featuredListings, tenants, verifications, reports, reviews,
      auditLogs: auditLogs + financialAudits,
    });
    if (blockers.length > 0) return { error: blockers.join(' '), status: 409 as const };

    await tx.property.delete({ where: { id: property.id } });
    return { media: property.media, status: 200 as const };
  });

  if (result.status !== 200) return NextResponse.json({ error: result.error }, { status: result.status });
  // The records are already gone; a failed asset cleanup only leaves an orphan, never a broken listing.
  await Promise.all(result.media.map((media) => destroyCloudinaryAsset(media)));
  return NextResponse.json({ success: true });
}
