import Link from 'next/link';
import { Prisma, PropertyStatus } from '@prisma/client';
import { PropertyCard } from '@/components/property-card';
import { PropertyMap } from '@/components/property-map';
import { SearchForm } from '@/components/search-form';
import { prisma } from '@/lib/prisma';
import { presentProperty, PROPERTY_WITH_RELATIONS_INCLUDE } from '@/lib/property-presenter';
import { propertySearchSchema } from '@/lib/validation';
import { getSessionUser } from '@/lib/auth';
import { getLocationIdsWithinRadius } from '@/lib/location';

export const dynamic = 'force-dynamic';

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const query = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [key, Array.isArray(value) ? value[0] : value]),
  );
  const parsed = propertySearchSchema.safeParse(query);
  const filters = parsed.success ? parsed.data : propertySearchSchema.parse({});
  const searchError = parsed.success ? '' : parsed.error.issues[0]?.message ?? 'Some search filters are invalid.';
  const currentUser = await getSessionUser();
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
    status: filters.availability ? (filters.availability as PropertyStatus) : PropertyStatus.PUBLISHED,
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
    price: { gte: filters.minPrice, lte: filters.maxPrice },
    location: Object.values(locationWhere).some((value) => value !== undefined) ? locationWhere : undefined,
  };
  if (filters.latitude !== undefined && filters.longitude !== undefined) {
    where.locationId = {
      in: await getLocationIdsWithinRadius(filters.latitude, filters.longitude, filters.radiusKm ?? 50),
    };
  }

  const orderBy: Prisma.PropertyOrderByWithRelationInput =
    filters.sort === 'price_asc' ? { price: 'asc' } :
      filters.sort === 'price_desc' ? { price: 'desc' } :
        { createdAt: 'desc' };

  const [databaseProperties, total] = await prisma.$transaction([
    prisma.property.findMany({
      where,
      include: PROPERTY_WITH_RELATIONS_INCLUDE,
      orderBy,
      skip: (filters.page - 1) * filters.pageSize,
      take: filters.pageSize,
    }),
    prisma.property.count({ where }),
  ]);
  const results = databaseProperties.map((property) => presentProperty(property));
  const retainedQuery = { ...query, page: String(filters.page) };

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Search</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">Property search</h1>
        </div>
        <Link href="/" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700">Back home</Link>
      </div>

      <SearchForm compact initialValues={query} />
      {searchError && <p role="alert" className="mt-3 rounded-md bg-amber-50 px-4 py-3 text-sm text-amber-900">{searchError}</p>}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <p className="text-lg font-semibold text-slate-900">{total} listings found</p>
        <div className="flex items-center gap-3 text-sm text-slate-600">
          <span>Sort: {filters.sort.replace('_', ' ')}</span>
          <span>•</span>
          <Link href={`/search?${new URLSearchParams({ ...retainedQuery, page: String(Math.max(filters.page - 1, 1)) }).toString()}`}>Previous</Link>
          <Link href={`/search?${new URLSearchParams({ ...retainedQuery, view: 'list' }).toString()}`} aria-current={filters.view === 'list' ? 'page' : undefined}>List</Link>
          <Link href={`/search?${new URLSearchParams({ ...retainedQuery, view: 'map' }).toString()}`} aria-current={filters.view === 'map' ? 'page' : undefined}>Map</Link>
          <Link href={`/search?${new URLSearchParams({ ...retainedQuery, page: String(filters.page + 1) }).toString()}`}>Next</Link>
        </div>
      </div>

      {filters.view === 'map' && <div className="mt-8 overflow-hidden rounded-lg border border-slate-200"><PropertyMap properties={results} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} /></div>}
      <div className={`mt-8 grid gap-6 ${filters.view === 'map' ? 'lg:grid-cols-2' : 'lg:grid-cols-3'}`}>
        {results.length ? results.map((property) => <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />) : (
          <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-slate-600 lg:col-span-3">
            No properties match these filters. Try clearing one or more filters.
          </div>
        )}
      </div>
    </main>
  );
}
