import Link from 'next/link';
import { Prisma, PropertyStatus } from '@prisma/client';
import { PropertyCard } from '@/components/property-card';
import { SearchForm } from '@/components/search-form';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';
import { propertySearchSchema } from '@/lib/validation';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const parsed = propertySearchSchema.safeParse(query);
  const filters = parsed.success ? parsed.data : propertySearchSchema.parse({});

  const where: Prisma.PropertyWhereInput = {
    status: filters.availability ? (filters.availability as PropertyStatus) : PropertyStatus.PUBLISHED,
    listingType: filters.listingType,
    type: filters.type ? { equals: filters.type, mode: 'insensitive' } : undefined,
    bedrooms: filters.bedrooms ? { gte: filters.bedrooms } : undefined,
    bathrooms: filters.bathrooms ? { gte: filters.bathrooms } : undefined,
    price: { gte: filters.minPrice, lte: filters.maxPrice },
    location: {
      OR: [filters.location, filters.state, filters.city, filters.area]
        .filter(Boolean)
        .map((value) => ({
          OR: [
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
    filters.sort === 'price_asc' ? { price: 'asc' } :
      filters.sort === 'price_desc' ? { price: 'desc' } :
        { createdAt: 'desc' };

  const [databaseProperties, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      include: { location: true, media: true, amenities: true, owner: true, agent: true },
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.property.count({ where }),
  ]);
  const results = databaseProperties.map((property) => presentProperty(property));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Search</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">Property search</h1>
        </div>
        <Link href="/" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Back home</Link>
      </div>

      <SearchForm compact />

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-lg font-semibold text-slate-900">{total} listings found</p>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>Sort: {filters.sort.replace('_', ' ')}</span>
          <span>•</span>
          <Link href={`/search?${new URLSearchParams({ ...query, page: String(Math.max(filters.page - 1, 1)) }).toString()}`}>Previous</Link>
          <Link href={`/search?${new URLSearchParams({ ...query, page: String(filters.page + 1) }).toString()}`}>Next</Link>
        </div>
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {results.length ? results.map((property) => <PropertyCard key={property.id} property={property} />) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-slate-600 lg:col-span-3">
            No properties match these filters. Try clearing one or more filters.
          </div>
        )}
      </div>
    </main>
  );
}
