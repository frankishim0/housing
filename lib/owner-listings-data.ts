import { prisma } from '@/lib/prisma';
import { buildOwnerListingOrderBy, buildOwnerListingWhere, LISTING_PAGE_SIZE, type OwnerListingQuery } from '@/lib/owner-listings';

export async function getOwnerListings(userId: string, query: OwnerListingQuery) {
  const where = buildOwnerListingWhere(userId, query);
  const [rows, total, grouped] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      orderBy: buildOwnerListingOrderBy(query.sort),
      skip: (query.page - 1) * LISTING_PAGE_SIZE,
      take: LISTING_PAGE_SIZE,
      select: {
        id: true, slug: true, title: true, status: true, listingType: true, type: true, price: true, currencyCode: true,
        verified: true, verifiedAt: true, createdAt: true, updatedAt: true,
        location: { select: { area: true, city: true, state: true, country: true } },
        media: { where: { type: 'IMAGE' }, orderBy: [{ isCover: 'desc' }, { order: 'asc' }], take: 1, select: { url: true } },
      },
    }),
    prisma.property.count({ where }),
    prisma.property.groupBy({ by: ['status'], where: buildOwnerListingWhere(userId, {}), orderBy: { status: 'asc' }, _count: { _all: true } }),
  ]);
  return {
    listings: rows.map(({ media, price, ...row }) => ({
      ...row,
      price: Number(price),
      coverUrl: media[0]?.url ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      verifiedAt: row.verifiedAt?.toISOString() ?? null,
    })),
    total,
    pages: Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE)),
    statusCounts: Object.fromEntries(grouped.map((item) => [item.status, (item._count as { _all: number })._all])) as Record<string, number>,
  };
}

export type OwnerListing = Awaited<ReturnType<typeof getOwnerListings>>['listings'][number];
