import { NextRequest, NextResponse } from 'next/server';
import { ListingType, MeasurementUnit, Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { propertySearchSchema } from '@/lib/validation';
import { getCurrencyName, isCurrencyCode } from '@/lib/international';
import { getCountryCurrency } from '@/lib/international';
import { getLocationIdsWithinRadius, upsertLocationHierarchy, toSlug } from '@/lib/location';
import { getCode } from 'country-list';

function serializeProperty<T extends { price: Prisma.Decimal | unknown; size: Prisma.Decimal | unknown }>(property: T) {
  return { ...property, price: Number(property.price), size: Number(property.size) };
}

export async function GET(request: NextRequest) {
  const parsed = propertySearchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const filters = parsed.data;
  const radiusKm = filters.radiusKm ?? 50;
  const locationText = [filters.location, filters.state, filters.region, filters.city, filters.area]
    .filter((value): value is string => Boolean(value));
  const locationWhere: Prisma.LocationWhereInput = {
    countryCode: filters.countryCode,
    postalCode: filters.postalCode ? { contains: filters.postalCode, mode: 'insensitive' } : undefined,
    ...(locationText.length ? {
      OR: locationText.map((value) => ({
        OR: [
          { country: { contains: value, mode: 'insensitive' as const } },
          { state: { contains: value, mode: 'insensitive' as const } },
          { city: { contains: value, mode: 'insensitive' as const } },
          { area: { contains: value, mode: 'insensitive' as const } },
          { address: { contains: value, mode: 'insensitive' as const } },
          { postalCode: { contains: value, mode: 'insensitive' as const } },
        ],
      })),
    } : {}),
  };
  const where: Prisma.PropertyWhereInput = {
    status: filters.availability
      ? (filters.availability as PropertyStatus)
      : PropertyStatus.PUBLISHED,
    listingType: filters.listingType,
    currencyCode: filters.currency,
    type: filters.type ? { equals: filters.type, mode: 'insensitive' } : undefined,
    bedrooms: filters.bedrooms ? { gte: filters.bedrooms } : undefined,
    bathrooms: filters.bathrooms ? { gte: filters.bathrooms } : undefined,
    size: { gte: filters.minSize, lte: filters.maxSize },
    sizeUnit: filters.sizeUnit,
    furnished: filters.furnished === undefined ? undefined : filters.furnished === 'true',
    parkingSpaces: filters.parkingSpaces ? { gte: filters.parkingSpaces } : undefined,
    hasPool: filters.hasPool === undefined ? undefined : filters.hasPool === 'true',
    hasSecurity: filters.hasSecurity === undefined ? undefined : filters.hasSecurity === 'true',
    yearBuilt: filters.yearBuiltFrom ? { gte: filters.yearBuiltFrom } : undefined,
    price: {
      gte: filters.minPrice,
      lte: filters.maxPrice,
    },
    amenities: filters.amenity
      ? { some: { name: { equals: filters.amenity, mode: 'insensitive' } } }
      : undefined,
    location: Object.values(locationWhere).some((value) => value !== undefined) ? locationWhere : undefined,
  };
  if (filters.latitude !== undefined && filters.longitude !== undefined) {
    where.locationId = { in: await getLocationIdsWithinRadius(filters.latitude, filters.longitude, radiusKm) };
  }

  const orderBy: Prisma.PropertyOrderByWithRelationInput =
    filters.sort === 'price_asc'
      ? { price: 'asc' }
      : filters.sort === 'price_desc'
        ? { price: 'desc' }
        : { createdAt: 'desc' };

  const [properties, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      include: {
        location: true,
        media: { orderBy: { order: 'asc' } },
        amenities: true,
        owner: { select: { id: true, name: true, profileImage: true, role: true, verificationStatus: true } },
        agent: { select: { id: true, name: true, profileImage: true, role: true, verificationStatus: true } },
      },
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.property.count({ where }),
  ]);

  const user = await getSessionUser();
  const favoriteIds = user
    ? new Set((await prisma.favorite.findMany({ where: { userId: user.id, propertyId: { in: properties.map((item) => item.id) } }, select: { propertyId: true } })).map((item) => item.propertyId))
    : new Set<string>();

  return NextResponse.json({
    data: properties.map((property) => {
      const safeProperty = serializeProperty(property);
      return {
        ...safeProperty,
        favorite: favoriteIds.has(property.id),
        location: property.location.hideExactAddress ? {
          ...property.location,
          address: [property.location.area, property.location.city, property.location.state, property.location.country].filter(Boolean).join(', '),
          latitude: property.location.latitude === null ? null : Math.round(property.location.latitude * 100) / 100,
          longitude: property.location.longitude === null ? null : Math.round(property.location.longitude * 100) / 100,
        } : property.location,
      };
    }),
    pagination: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.ceil(total / filters.pageSize) },
  });
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireRole([UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER]);
  } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? 'Authentication required.' : 'Owner or agent role required.' }, { status });
  }

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object') return NextResponse.json({ error: 'Invalid listing details.' }, { status: 400 });
  const countryCode = String(body.countryCode ?? getCode(String(body.country ?? '')) ?? '').toUpperCase();
  const regionName = body.region ?? body.state;
  const neighborhood = body.neighborhood ?? body.area;
  const required = ['title', 'description', 'type', 'listingType', 'price', 'bedrooms', 'bathrooms', 'size', 'city', 'address'];
  const missing = required.filter((field) => body[field] === undefined || body[field] === '');
  if (!countryCode) missing.push('countryCode');
  if (!regionName) missing.push('region');
  if (!neighborhood) missing.push('neighborhood');
  if (missing.length) return NextResponse.json({ error: `Missing fields: ${missing.join(', ')}` }, { status: 400 });
  const listingTypes = ['RENT', 'SALE', 'SHORT_TERM_RENT', 'LONG_TERM_RENT', 'LEASE'];
  if (!listingTypes.includes(String(body.listingType))) return NextResponse.json({ error: 'Choose a valid listing type.' }, { status: 400 });
  const currencyCode = String(body.currencyCode ?? getCountryCurrency(countryCode) ?? 'NGN').toUpperCase();
  if (!isCurrencyCode(currencyCode)) return NextResponse.json({ error: 'Choose a valid ISO listing currency.' }, { status: 400 });
  const numericFields = ['price', 'bedrooms', 'bathrooms', 'size'];
  if (numericFields.some((field) => !Number.isFinite(Number(body[field])) || Number(body[field]) < 0) || Number(body.price) <= 0 || Number(body.size) <= 0) {
    return NextResponse.json({ error: 'Enter valid property price, room counts, and size.' }, { status: 400 });
  }
  const coordinate = (value: unknown, min: number, max: number) => value === undefined || value === '' ? null : Number.isFinite(Number(value)) && Number(value) >= min && Number(value) <= max ? Number(value) : NaN;
  const latitude = coordinate(body.latitude, -90, 90);
  const longitude = coordinate(body.longitude, -180, 180);
  if (Number.isNaN(latitude) || Number.isNaN(longitude)) return NextResponse.json({ error: 'Enter valid latitude and longitude coordinates.' }, { status: 400 });

  const typeName = String(body.type).trim().slice(0, 100);
  const typeCode = toSlug(typeName);
  const amenityNames: string[] = Array.isArray(body.amenities)
    ? body.amenities.filter((item: unknown): item is string => typeof item === 'string')
    : typeof body.amenities === 'string' ? body.amenities.split(',') : [];
  const amenities: Prisma.PropertyAmenityCreateWithoutPropertyInput[] = amenityNames
    .map((name) => name.trim().slice(0, 80))
    .filter(Boolean)
    .map((name) => ({ name }));
  const activeSubscription = await prisma.userSubscription.findFirst({
    where: { userId: user.id, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
    include: { product: { select: { listingLimit: true } } },
    orderBy: { currentPeriodEnd: 'desc' },
  });
  if (activeSubscription?.product.listingLimit !== null && activeSubscription?.product.listingLimit !== undefined) {
    const listingCount = await prisma.property.count({ where: { OR: [{ ownerId: user.id }, { agentId: user.id }] } });
    if (listingCount >= activeSubscription.product.listingLimit) {
      return NextResponse.json({ error: `Your active subscription allows up to ${activeSubscription.product.listingLimit} listings. Upgrade your plan to add more.` }, { status: 403 });
    }
  }
  const property = await prisma.$transaction(async (transaction) => {
    const locationData = await upsertLocationHierarchy(transaction, {
      countryCode,
      region: String(regionName),
      city: String(body.city),
      neighborhood: String(neighborhood),
      postalCode: typeof body.postalCode === 'string' ? body.postalCode : undefined,
      address: String(body.address),
      latitude: latitude ?? undefined,
      longitude: longitude ?? undefined,
      hideExactAddress: body.hideExactAddress === true || body.hideExactAddress === 'true' || body.hideExactAddress === 'on',
    });
    await transaction.currency.upsert({
      where: { code: currencyCode },
      create: { code: currencyCode, name: getCurrencyName(currencyCode) },
      update: {},
    });
    const propertyType = await transaction.propertyType.upsert({
      where: { code: typeCode },
      create: { id: `property-type-${typeCode}`, code: typeCode, name: typeName },
      update: { name: typeName },
    });
    const slug = `${toSlug(String(body.title))}-${crypto.randomUUID().slice(0, 8)}`;
    return transaction.property.create({
      data: {
        slug,
        title: String(body.title).trim().slice(0, 160),
        description: String(body.description).trim(),
        type: typeName,
        listingType: body.listingType as ListingType,
        price: Number(body.price),
        currency: { connect: { code: currencyCode } },
        propertyType: { connect: { id: propertyType.id } },
        bedrooms: Number(body.bedrooms),
        bathrooms: Number(body.bathrooms),
        size: Number(body.size),
        sizeUnit: Object.values(MeasurementUnit).includes(body.sizeUnit as MeasurementUnit) ? body.sizeUnit as MeasurementUnit : MeasurementUnit.SQUARE_METERS,
        furnished: body.furnished === 'true' ? true : body.furnished === 'false' ? false : null,
        parkingSpaces: body.parkingSpaces === undefined || body.parkingSpaces === '' ? null : Math.max(0, Math.floor(Number(body.parkingSpaces))),
        hasPool: body.hasPool === true || body.hasPool === 'true' || body.hasPool === 'on',
        hasSecurity: body.hasSecurity === true || body.hasSecurity === 'true' || body.hasSecurity === 'on',
        luxury: body.luxury === true || body.luxury === 'true' || body.luxury === 'on',
        yearBuilt: body.yearBuilt === undefined || body.yearBuilt === '' ? null : Math.max(1000, Math.floor(Number(body.yearBuilt))),
        owner: { connect: { id: user.id } },
        agent: user.role === UserRole.AGENT || user.role === UserRole.PROPERTY_MANAGER ? { connect: { id: user.id } } : undefined,
        location: { create: locationData },
        amenities: { create: amenities },
      },
      include: { location: true, amenities: true },
    });
  });

  return NextResponse.json({ data: serializeProperty(property) }, { status: 201 });
}
