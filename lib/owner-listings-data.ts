import { ModerationAuditAction } from '@prisma/client';
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

  const propertyIds = rows.map((row) => row.id);
  const rejectionLogs = propertyIds.length === 0 ? [] : await prisma.moderationAuditLog.findMany({
    where: {
      entityType: 'Property',
      entityId: { in: propertyIds },
      action: ModerationAuditAction.PROPERTY_REVIEW_REJECTED,
    },
    orderBy: { createdAt: 'desc' },
    select: { entityId: true, reason: true, createdAt: true },
  });
  const latestRejections = new Map<string, { reason: string | null; rejectedAt: string | null }>();
  for (const log of rejectionLogs) {
    if (!latestRejections.has(log.entityId)) {
      latestRejections.set(log.entityId, {
        reason: log.reason ?? null,
        rejectedAt: log.createdAt.toISOString(),
      });
    }
  }

  return {
    listings: rows.map(({ media, price, ...row }) => {
      const rejection = latestRejections.get(row.id);
      return {
        ...row,
        price: Number(price),
        coverUrl: media[0]?.url ?? null,
        rejectionReason: rejection?.reason ?? null,
        rejectedAt: rejection?.rejectedAt ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        verifiedAt: row.verifiedAt?.toISOString() ?? null,
      };
    }),
    total,
    pages: Math.max(1, Math.ceil(total / LISTING_PAGE_SIZE)),
    statusCounts: Object.fromEntries(grouped.map((item) => [item.status, (item._count as { _all: number })._all])) as Record<string, number>,
  };
}

export type OwnerListing = Awaited<ReturnType<typeof getOwnerListings>>['listings'][number];
