import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getData } from 'country-list';
import { PropertyCard } from '@/components/property-card';
import { getSessionUser } from '@/lib/auth';
import { toSlug } from '@/lib/location';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';

export const dynamic = 'force-dynamic';

async function resolveLocation(params: Promise<{ slug: string; location: string[] }>) {
  const parts = await params;
  if (parts.location.length < 1 || parts.location.length > 2 || parts.location.some((part) => !part)) return null;
  const country = getData().find((item) => toSlug(item.name) === parts.slug);
  if (!country) return null;
  const [region, city] = parts.location.length === 2 ? parts.location : [undefined, parts.location[0]];
  return {
    country,
    region: region?.replaceAll('-', ' '),
    city: city.replaceAll('-', ' '),
  };
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string; location: string[] }> }): Promise<Metadata> {
  const location = await resolveLocation(params);
  if (!location) return { title: 'Location not found | Homes Worldwide' };
  const name = [location.city, location.region, location.country.name].filter(Boolean).join(', ');
  const locationPath = [location.region, location.city].filter((part): part is string => Boolean(part)).map(toSlug).join('/');
  const canonical = process.env.APP_URL ? `${process.env.APP_URL.replace(/\/$/, '')}/properties/${toSlug(location.country.name)}/${locationPath}` : undefined;
  return {
    title: `Properties in ${name} | Homes Worldwide`,
    description: `Explore properties for sale and rent in ${name}. Compare homes, prices, property types, and local listings.`,
    alternates: canonical ? { canonical } : undefined,
    openGraph: { title: `Properties in ${name}`, description: `Discover real estate listings in ${name}.`, ...(canonical ? { url: canonical } : {}), type: 'website' },
  };
}

export default async function PropertyLocationPage({ params }: { params: Promise<{ slug: string; location: string[] }> }) {
  const location = await resolveLocation(params);
  if (!location) notFound();
  const where = {
    status: 'PUBLISHED' as const,
    location: {
      countryCode: location.country.code,
      cityRecord: { name: { equals: location.city, mode: 'insensitive' as const } },
      ...(location.region ? { regionRecord: { name: { equals: location.region, mode: 'insensitive' as const } } } : {}),
    },
  };
  const [currentUser, records, total] = await Promise.all([
    getSessionUser(),
    prisma.property.findMany({ where, include: { location: true, media: true, amenities: true, owner: true, agent: true }, orderBy: { createdAt: 'desc' }, take: 24 }),
    prisma.property.count({ where }),
  ]);
  const properties = records.map((property) => presentProperty(property));
  const name = [location.city, location.region, location.country.name].filter(Boolean).join(', ');

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <nav className="mb-5 text-sm text-slate-500"><Link href="/">Home</Link> / <Link href="/search">Properties</Link> / {name}</nav>
      <header className="mb-7"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Location guide</p><h1 className="mt-2 text-3xl font-bold">Properties in {name}</h1><p className="mt-2 text-slate-600">{total} published listings</p></header>
      <div className="grid gap-6 lg:grid-cols-3">{properties.map((property) => <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />)}</div>
      {properties.length === 0 && <p className="rounded-lg border border-dashed border-slate-300 p-10 text-slate-600">No published properties are available in this location yet.</p>}
    </main>
  );
}
