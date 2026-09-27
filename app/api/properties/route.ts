import { NextRequest, NextResponse } from 'next/server';
import { ListingType, Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser, requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { propertySearchSchema } from '@/lib/validation';

function serializeProperty<T extends { price: Prisma.Decimal | unknown }>(property: T) {
  return { ...property, price: Number(property.price) };
}

export async function GET(request: NextRequest) {
  const parsed = propertySearchSchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const filters = parsed.data;
  const where: Prisma.PropertyWhereInput = {
    status: filters.availability
      ? (filters.availability as PropertyStatus)
      : PropertyStatus.PUBLISHED,
    listingType: filters.listingType,
    type: filters.type ? { equals: filters.type, mode: 'insensitive' } : undefined,
    bedrooms: filters.bedrooms ? { gte: filters.bedrooms } : undefined,
    bathrooms: filters.bathrooms ? { gte: filters.bathrooms } : undefined,
    price: {
      gte: filters.minPrice,
      lte: filters.maxPrice,
    },
    amenities: filters.amenity
      ? { some: { name: { equals: filters.amenity, mode: 'insensitive' } } }
      : undefined,
    location: {
      OR: [filters.location, filters.state, filters.city, filters.area]
        .filter(Boolean)
        .map((value) => ({
          OR: [
            { country: { contains: value, mode: 'insensitive' as const } },
            { state: { contains: value, mode: 'insensitive' as const } },
            { city: { contains: value, mode: 'insensitive' as const } },
            { area: { contains: value, mode: 'insensitive' as const } },
            { address: { contains: value, mode: 'insensitive' as const } },
          ],
        })),
    },
  };

  if (!where.location?.OR?.length) delete where.location;

  const orderBy: Prisma.PropertyOrderByWithRelationInput =
    filters.sort === 'price_asc'
      ? { price: 'asc' }
      : filters.sort === 'price_desc'
        ? { price: 'desc' }
        : { createdAt: 'desc' };

  const [properties, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      include: { location: true, media: { orderBy: { order: 'asc' } }, amenities: true, owner: true, agent: true },
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
    data: properties.map((property) => ({ ...serializeProperty(property), favorite: favoriteIds.has(property.id) })),
    pagination: { page: filters.page, pageSize: filters.pageSize, total, pages: Math.ceil(total / filters.pageSize) },
  });
}

export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireRole([UserRole.OWNER, UserRole.AGENT]);
  } catch (error) {
    const status = error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403;
    return NextResponse.json({ error: status === 401 ? 'Authentication required.' : 'Owner or agent role required.' }, { status });
  }

  const body = await request.json();
  const required = ['title', 'description', 'type', 'listingType', 'price', 'bedrooms', 'bathrooms', 'size', 'country', 'state', 'city', 'area', 'address'];
  const missing = required.filter((field) => body[field] === undefined || body[field] === '');
  if (missing.length) return NextResponse.json({ error: `Missing fields: ${missing.join(', ')}` }, { status: 400 });

  const slug = `${body.title}-${crypto.randomUUID().slice(0, 8)}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const property = await prisma.property.create({
    data: {
      slug,
      title: String(body.title),
      description: String(body.description),
      type: String(body.type),
      listingType: body.listingType === 'SALE' ? ListingType.SALE : ListingType.RENT,
      price: Number(body.price),
      bedrooms: Number(body.bedrooms),
      bathrooms: Number(body.bathrooms),
      size: Number(body.size),
      owner: { connect: { id: user.id } },
      agent: user.role === UserRole.AGENT ? { connect: { id: user.id } } : undefined,
      location: {
        create: {
          country: String(body.country),
          state: String(body.state),
          city: String(body.city),
          area: String(body.area),
          address: String(body.address),
        },
      },
      amenities: {
        create: Array.isArray(body.amenities)
          ? body.amenities.filter((item: unknown): item is string => typeof item === 'string').map((name: string) => ({ name }))
          : [],
      },
    },
    include: { location: true, amenities: true },
  });

  return NextResponse.json({ data: serializeProperty(property) }, { status: 201 });
}
