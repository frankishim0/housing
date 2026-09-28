import { NextRequest, NextResponse } from 'next/server';
import { ListingType, MeasurementUnit, Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCurrencyName, isCurrencyCode } from '@/lib/international';
import { toSlug } from '@/lib/location';
import { notifySavedPropertyUsers } from '@/lib/notifications';

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
  if (!property || property.status === PropertyStatus.DRAFT || property.status === PropertyStatus.SUSPENDED) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
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
  if (user.role !== UserRole.ADMIN && property.ownerId !== user.id && property.agentId !== user.id) {
    return NextResponse.json({ error: 'You do not own this property.' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid listing details.' }, { status: 400 });
  const data: Prisma.PropertyUpdateInput = {};
  for (const field of ['title', 'description', 'type', 'price', 'bedrooms', 'bathrooms', 'size', 'parkingSpaces', 'yearBuilt'] as const) {
    if (body[field] !== undefined) data[field] = field === 'title' || field === 'description' || field === 'type' ? String(body[field]) : Number(body[field]);
  }
  if (body.listingType !== undefined) {
    if (!Object.values(ListingType).includes(body.listingType as ListingType)) return NextResponse.json({ error: 'Invalid listing type.' }, { status: 400 });
    data.listingType = body.listingType as ListingType;
  }
  if (body.sizeUnit !== undefined) {
    if (!Object.values(MeasurementUnit).includes(body.sizeUnit as MeasurementUnit)) return NextResponse.json({ error: 'Invalid measurement unit.' }, { status: 400 });
    data.sizeUnit = body.sizeUnit as MeasurementUnit;
  }
  if (body.furnished !== undefined) data.furnished = body.furnished === null ? null : Boolean(body.furnished);
  if (body.hasPool !== undefined) data.hasPool = Boolean(body.hasPool);
  if (body.hasSecurity !== undefined) data.hasSecurity = Boolean(body.hasSecurity);
  if (body.luxury !== undefined) data.luxury = Boolean(body.luxury);
  if (body.currencyCode !== undefined) {
    const currencyCode = String(body.currencyCode).toUpperCase();
    if (!isCurrencyCode(currencyCode)) return NextResponse.json({ error: 'Choose a valid ISO currency.' }, { status: 400 });
    await prisma.currency.upsert({ where: { code: currencyCode }, create: { code: currencyCode, name: getCurrencyName(currencyCode) }, update: {} });
    data.currency = { connect: { code: currencyCode } };
  }
  if (body.type !== undefined) {
    const name = String(body.type).trim().slice(0, 100);
    const code = toSlug(name);
    const propertyType = await prisma.propertyType.upsert({
      where: { code },
      create: { id: `property-type-${code}`, code, name },
      update: { name },
    });
    data.type = name;
    data.propertyType = { connect: { id: propertyType.id } };
  }
  if (body.status) data.status = body.status as PropertyStatus;
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
