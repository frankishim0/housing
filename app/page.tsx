import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, MapPin, MessageSquareText, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { PropertyCard } from '@/components/property-card';
import { SearchForm } from '@/components/search-form';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';
import { getSessionUser } from '@/lib/auth';
import { getMessages } from '@/lib/i18n';
import { toSlug } from '@/lib/location';
import { NearbyProperties } from '@/components/nearby-properties';

export const dynamic = 'force-dynamic';

const categories = [
  { name: 'Residential', count: 'Apartments, houses, villas, and more', color: 'bg-emerald-100 text-emerald-700' },
  { name: 'Short stays', count: 'Flexible furnished rentals', color: 'bg-sky-100 text-sky-700' },
  { name: 'Commercial', count: 'Retail, offices, and industrial', color: 'bg-amber-100 text-amber-700' },
  { name: 'Land', count: 'Lots, farms, and development sites', color: 'bg-violet-100 text-violet-700' },
];

const stats = [
  { label: 'Explore', value: 'Any country' },
  { label: 'Currency', value: 'Local prices' },
  { label: 'Professionals', value: 'Verified-ready' },
  { label: 'Contact', value: 'Cross-border' },
];

export default async function HomePage() {
  const currentUser = await getSessionUser();
  const t = getMessages(currentUser?.preferredLanguage);
  const [databaseProperties, luxuryRecords, rentRecords, saleRecords, popularCountryRecords] = await Promise.all([prisma.property.findMany({
    where: { status: 'PUBLISHED' },
    include: { location: true, media: true, amenities: true, owner: true, agent: true },
    orderBy: { createdAt: 'desc' },
    take: 18,
  }),
  prisma.property.findMany({ where: { status: 'PUBLISHED', luxury: true }, include: { location: true, media: true, amenities: true, owner: true, agent: true }, orderBy: { createdAt: 'desc' }, take: 3 }),
  prisma.property.findMany({ where: { status: 'PUBLISHED', listingType: { in: ['RENT', 'SHORT_TERM_RENT', 'LONG_TERM_RENT'] } }, include: { location: true, media: true, amenities: true, owner: true, agent: true }, orderBy: { createdAt: 'desc' }, take: 3 }),
  prisma.property.findMany({ where: { status: 'PUBLISHED', listingType: 'SALE' }, include: { location: true, media: true, amenities: true, owner: true, agent: true }, orderBy: { createdAt: 'desc' }, take: 3 }),
  prisma.location.findMany({
    where: { properties: { some: { status: 'PUBLISHED' } } },
    select: { country: true, countryCode: true, _count: { select: { properties: true } } },
    orderBy: { properties: { _count: 'desc' } },
    distinct: ['countryCode'],
    take: 6,
  })]);
  const promotionHistory = await prisma.featuredListing.findMany({
    where: { propertyId: { in: databaseProperties.map((property) => property.id) }, status: 'PAID' },
    select: { propertyId: true, startsAt: true, expiresAt: true },
  });
  const promotionsByProperty = new Map<string, typeof promotionHistory>();
  for (const promotion of promotionHistory) {
    const promotions = promotionsByProperty.get(promotion.propertyId) ?? [];
    promotions.push(promotion);
    promotionsByProperty.set(promotion.propertyId, promotions);
  }
  const now = new Date();
  const presented = databaseProperties.map((property) => {
    const promotionRecords = promotionsByProperty.get(property.id);
    const featured = promotionRecords
      ? promotionRecords.some((promotion) => promotion.startsAt !== null && promotion.startsAt <= now && (!promotion.expiresAt || promotion.expiresAt > now))
      : property.featured;
    return { ...presentProperty(property), featured };
  });
  const featured = presented.filter((property) => property.featured);
  const recent = presented.slice(0, 3);
  const luxuryProperties = luxuryRecords.map((property) => presentProperty(property));
  const rentals = rentRecords.map((property) => presentProperty(property));
  const propertiesForSale = saleRecords.map((property) => presentProperty(property));
  const popularLocations = (await prisma.location.findMany({
    where: { properties: { some: { status: 'PUBLISHED' } } },
    include: { _count: { select: { properties: true } } },
    orderBy: { properties: { _count: 'desc' } },
    take: 4,
  })).map((location) => ({
    name: location.area,
    state: location.city,
    country: location.country,
    countryCode: location.countryCode,
    region: location.state,
    listings: location._count.properties,
    image: 'https://images.unsplash.com/photo-1505693416388-ac5ce068fe85?auto=format&fit=crop&w=900&q=80',
  }));

  return (
    <main className="bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-5 lg:px-8">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-emerald-600 text-lg font-bold text-white">N</div>
            <div>
              <p className="text-xl font-bold tracking-tight">Homes Worldwide</p>
              <p className="text-xs text-slate-500">Global real-estate marketplace</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="/search">Buy</Link>
            <Link href="/search?listingType=Rent">Rent</Link>
            <Link href="/messages" className="hidden md:inline">Messages</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/listings/new">List property</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/messages" className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-600 hover:bg-slate-100 md:hidden" aria-label="Messages"><MessageSquareText size={19} /></Link>
            <Link href="/auth" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Log in</Link>
            <Link href="/auth" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Join now</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#edfdf6_100%)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <ShieldCheck size={16} /> A more open property marketplace
            </div>
            <h1 className="max-w-xl text-5xl font-black tracking-tight text-slate-900 sm:text-6xl">{t.heroTitle}</h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              {t.heroDescription}
            </p>

            <div className="mt-8 flex flex-wrap gap-4">
              <Link href="/search" className="rounded-full bg-emerald-600 px-6 py-3 font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">Explore properties</Link>
              <Link href="/listings/new" className="rounded-full border border-slate-200 bg-white px-6 py-3 font-semibold text-slate-700">List your property</Link>
            </div>

            <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {stats.map((stat) => (
                <div key={stat.label} className="rounded-2xl border border-slate-200 bg-white/80 p-4 shadow-sm">
                  <p className="text-2xl font-bold text-slate-900">{stat.value}</p>
                  <p className="mt-1 text-sm text-slate-600">{stat.label}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="relative">
            <div className="rounded-[32px] border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-200/80">
              <Image
                src="https://images.unsplash.com/photo-1560185007-cde436f6a4d0?auto=format&fit=crop&w=1200&q=80"
                alt="Luxury home exterior"
                width={1200}
                height={900}
                className="h-[500px] w-full rounded-[24px] object-cover"
              />
            </div>
            <div className="absolute -bottom-6 left-6 rounded-2xl border border-slate-200 bg-white p-4 shadow-lg">
              <p className="text-xs uppercase tracking-[0.2em] text-slate-500">Featured deal</p>
              <div className="mt-2 flex items-center justify-between gap-4">
                <div>
                  <p className="text-lg font-bold text-slate-900">Global listings</p>
                  <p className="text-sm text-slate-600">One search, many markets</p>
                </div>
                <div className="flex items-center gap-1 rounded-full bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700">
                  <Star size={12} fill="currentColor" /> 4.9
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-12 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Search</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">Find the right home</h2>
          </div>
          <Link href="/search" className="hidden items-center gap-2 text-sm font-semibold text-slate-700 md:inline-flex">Advanced search <ArrowRight size={16} /></Link>
        </div>
        <SearchForm />
      </section>

      <NearbyProperties preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} />

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold text-slate-900">Featured properties</h2>
          <Link href="/search" className="text-sm font-semibold text-emerald-700">View all</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {featured.map((property) => (
            <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold text-slate-900">{t.recentlyAdded}</h2>
          <Link href="/search" className="text-sm font-semibold text-emerald-700">Browse market</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {recent.map((property) => (
            <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between"><div><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Curated</p><h2 className="mt-2 text-3xl font-bold text-slate-900">{t.luxuryProperties}</h2></div><Link href="/search?sort=price_desc" className="text-sm font-semibold text-emerald-800">Explore luxury</Link></div>
        <div className="grid gap-6 lg:grid-cols-3">{luxuryProperties.map((property) => <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />)}</div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between"><h2 className="text-3xl font-bold text-slate-900">{t.forRent}</h2><Link href="/search?listingType=RENT" className="text-sm font-semibold text-emerald-800">Browse rentals</Link></div>
        <div className="grid gap-6 lg:grid-cols-3">{rentals.map((property) => <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />)}</div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between"><h2 className="text-3xl font-bold text-slate-900">{t.forSale}</h2><Link href="/search?listingType=SALE" className="text-sm font-semibold text-emerald-800">Browse homes for sale</Link></div>
        <div className="grid gap-6 lg:grid-cols-3">{propertiesForSale.map((property) => <PropertyCard key={property.id} property={property} preferredCurrency={currentUser?.preferredCurrency ?? 'USD'} preferredMeasurement={currentUser?.measurementUnit} />)}</div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">{t.popularCities}</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Explore active property markets</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {popularLocations.map((place) => (
            <Link key={`${place.countryCode}-${place.name}`} href={`/properties/${toSlug(place.country)}/${toSlug(place.region)}/${toSlug(place.state)}`} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <Image src={place.image} alt={place.name} width={900} height={700} className="h-52 w-full object-cover" />
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{place.name}</p>
                  <p className="text-sm text-slate-500">{place.state}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{place.listings} homes</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6"><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">{t.popularCountries}</p><h2 className="mt-2 text-3xl font-bold text-slate-900">Markets around the world</h2></div>
        <div className="flex flex-wrap gap-3">{popularCountryRecords.map((country) => <Link key={country.countryCode ?? country.country} href={country.countryCode ? `/search?countryCode=${country.countryCode}` : `/search?location=${encodeURIComponent(country.country)}`} className="rounded-md border border-slate-200 bg-white px-4 py-3 text-sm font-semibold text-slate-800 hover:border-emerald-700">{country.country}<span className="ml-2 text-slate-500">{country._count.properties}</span></Link>)}</div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Property categories</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Choose the right fit</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {categories.map((category) => (
            <div key={category.name} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className={`inline-flex rounded-2xl p-3 ${category.color}`}><Building2 size={20} /></div>
              <p className="mt-5 text-xl font-semibold text-slate-900">{category.name}</p>
              <p className="mt-1 text-sm text-slate-500">{category.count}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="grid gap-6 rounded-[32px] bg-slate-900 p-8 text-white lg:grid-cols-[1fr_1fr]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">For owners & agents</p>
            <h2 className="mt-3 text-3xl font-bold">List your property with confidence</h2>
            <p className="mt-3 max-w-lg text-slate-300">Reach qualified buyers, tenants, and investors while managing enquiries, viewings, and payments in one place.</p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link href="/listings/new" className="rounded-full bg-emerald-500 px-5 py-3 font-semibold text-slate-950">Create listing</Link>
              <Link href="/dashboard" className="rounded-full border border-slate-700 px-5 py-3 font-semibold text-white">Owner dashboard</Link>
            </div>
          </div>
          <div className="grid gap-4">
            {['Fast listing approval', 'Secure lead management', 'Built-in verification flow'].map((item) => (
              <div key={item} className="flex items-center gap-3 rounded-2xl border border-slate-700 bg-slate-800 p-4 text-slate-100">
                <CheckCircle2 className="text-emerald-400" size={18} />
                <span>{item}</span>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">How it works</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Simple, honest, and secure</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-3">
          {[
            { icon: MapPin, title: 'Search smarter', copy: 'Filter by city, price, size, amenities, and property type.' },
            { icon: MessageSquareText, title: 'Connect quickly', copy: 'Reach out to agents or owners, request viewings, and enquire instantly.' },
            { icon: TrendingUp, title: 'Close with confidence', copy: 'Track payments, viewings, and verification for a clear, professional experience.' },
          ].map(({ icon: Icon, title, copy }) => (
            <div key={title} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-4 inline-flex rounded-2xl bg-emerald-100 p-3 text-emerald-700"><Icon size={20} /></div>
              <h3 className="text-xl font-semibold text-slate-900">{title}</h3>
              <p className="mt-2 text-slate-600">{copy}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4 lg:px-8">
          <div>
            <p className="text-xl font-bold text-slate-900">Homes Worldwide</p>
            <p className="mt-3 text-sm text-slate-600">A global place to discover homes, connect with local professionals, and explore new markets.</p>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Explore</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Rent</li>
              <li>Buy</li>
              <li>Commercial</li>
              <li>Agents</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Company</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>About us</li>
              <li>FAQs</li>
              <li>Privacy</li>
              <li>Contact</li>
            </ul>
          </div>
          <div>
            <p className="font-semibold text-slate-900">Countries</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              {popularCountryRecords.slice(0, 4).map((country) => <li key={country.countryCode}>{country.country}</li>)}
            </ul>
          </div>
        </div>
      </footer>
    </main>
  );
}
