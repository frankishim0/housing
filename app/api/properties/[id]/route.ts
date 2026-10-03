import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrencyName } from '@/lib/international';
import { toSlug } from '@/lib/location';
import { notifySavedPropertyUsers } from '@/lib/notifications';
import { propertyUpdateSchema } from '@/lib/validation';
import { canViewNonPublicProperty, isOwnerStatusTransitionAllowed, isPubliclyVisibleStatus, shouldInvalidateVerification } from '@/lib/property-lifecycle';

function serialized<T extends { price: Prisma.Decimal | unknown; size: Prisma.Decimal | unknown }>(property: T) {
  return { ...property, price: Number(property.price), size: Number(property.size) };
}

async function findProperty(id: string) {
  return prisma.property.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: {
      location: true,
      media: { orderBy: { order: 'asc' } },
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
  return NextResponse.json({ data: serialized({ ...property, location }) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !([UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER, UserRole.ADMIN] as UserRole[]).includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: user ? 403 : 401 });
  }

  const property = await findProperty((await params).id);
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  const isAdmin = user.role === UserRole.ADMIN;
  if (!isAdmin && property.ownerId !== user.id && property.agentId !== user.id) {
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
  if (fields.currencyCode !== undefined) {
    const currencyCode = fields.currencyCode;
    await prisma.currency.upsert({ where: { code: currencyCode }, create: { code: currencyCode, name: getCurrencyName(currencyCode) }, update: {} });
    data.currency = { connect: { code: currencyCode } };
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
  if (requestedStatus !== undefined) {
    data.status = requestedStatus;
    data.publishedAt = requestedStatus === PropertyStatus.PUBLISHED ? new Date() : null;
  }
  if (shouldInvalidateVerification(Object.keys(fields), property.verified)) {
    data.verified = false;
    data.verifiedAt = null;
  }

  const updated = await prisma.property.update({ where: { id: property.id }, data, include: { location: true, media: true, amenities: true } });
  await notifySavedPropertyUsers(property.id, `A property you saved has updated details or availability: ${updated.title}.`, user.id);
  return NextResponse.json({ data: serialized(updated) });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const property = await findProperty((await params).id);
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  if (user.role !== UserRole.ADMIN && property.ownerId !== user.id && property.agentId !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  await prisma.property.delete({ where: { id: property.id } });
  return NextResponse.json({ success: true });
}
