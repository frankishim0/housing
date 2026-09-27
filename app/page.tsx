import Image from 'next/image';
import Link from 'next/link';
import { ArrowRight, Building2, CheckCircle2, MapPin, MessageSquareText, ShieldCheck, Star, TrendingUp } from 'lucide-react';
import { PropertyCard } from '@/components/property-card';
import { SearchForm } from '@/components/search-form';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';

export const dynamic = 'force-dynamic';

const categories = [
  { name: 'Apartments', count: '1,240 listings', color: 'bg-emerald-100 text-emerald-700' },
  { name: 'Houses', count: '890 listings', color: 'bg-sky-100 text-sky-700' },
  { name: 'Commercial', count: '360 listings', color: 'bg-amber-100 text-amber-700' },
  { name: 'Land', count: '540 listings', color: 'bg-violet-100 text-violet-700' },
];

const stats = [
  { label: 'Verified listings', value: '18.4k+' },
  { label: 'Happy clients', value: '14k+' },
  { label: 'Avg. response time', value: '< 2h' },
  { label: 'Cities covered', value: '24' },
];

const testimonials = [
  { name: 'Chiamaka A.', quote: 'The search experience and verified listings made our apartment hunt in Lagos effortless.' },
  { name: 'Sylvester O.', quote: 'We found a premium duplex in Abuja within days, and the dashboard kept us organized.' },
];

export default async function HomePage() {
  const databaseProperties = await prisma.property.findMany({
    where: { status: 'PUBLISHED' },
    include: { location: true, media: true, amenities: true, owner: true, agent: true },
    orderBy: { createdAt: 'desc' },
    take: 6,
  });
  const presented = databaseProperties.map((property) => presentProperty(property));
  const featured = presented.filter((property) => property.featured);
  const recent = presented.slice(0, 3);
  const popularLocations = (await prisma.location.findMany({
    where: { properties: { some: { status: 'PUBLISHED' } } },
    include: { _count: { select: { properties: true } } },
    orderBy: { properties: { _count: 'desc' } },
    take: 4,
  })).map((location) => ({
    name: location.area,
    state: location.city,
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
              <p className="text-xl font-bold tracking-tight">Nigerian Homes</p>
              <p className="text-xs text-slate-500">Property marketplace</p>
            </div>
          </div>
          <nav className="hidden items-center gap-6 text-sm font-medium text-slate-600 md:flex">
            <Link href="/search">Buy</Link>
            <Link href="/search?listingType=Rent">Rent</Link>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/listings/new">List property</Link>
          </nav>
          <div className="flex items-center gap-3">
            <Link href="/auth" className="rounded-full border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700">Log in</Link>
            <Link href="/auth" className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white">Join now</Link>
          </div>
        </div>
      </header>

      <section className="relative overflow-hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(180deg,_#f8fafc_0%,_#edfdf6_100%)]">
        <div className="mx-auto grid max-w-7xl gap-12 px-4 py-16 lg:grid-cols-[1.2fr_0.8fr] lg:px-8 lg:py-24">
          <div>
            <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-700">
              <ShieldCheck size={16} /> Trusted property marketplace for Nigeria
            </div>
            <h1 className="max-w-xl text-5xl font-black tracking-tight text-slate-900 sm:text-6xl">
              Find your next home with confidence.
            </h1>
            <p className="mt-5 max-w-xl text-lg text-slate-600">
              Discover verified homes, apartments, and commercial property opportunities across Nigeria’s most in-demand cities.
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
                  <p className="text-lg font-bold text-slate-900">₦93m</p>
                  <p className="text-sm text-slate-600">Maitama duplex</p>
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

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold text-slate-900">Featured properties</h2>
          <Link href="/search" className="text-sm font-semibold text-emerald-700">View all</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {featured.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-3xl font-bold text-slate-900">Recently added</h2>
          <Link href="/search" className="text-sm font-semibold text-emerald-700">Browse market</Link>
        </div>
        <div className="grid gap-6 lg:grid-cols-3">
          {recent.map((property) => (
            <PropertyCard key={property.id} property={property} />
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Popular locations</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">Explore high-demand areas</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
          {popularLocations.map((place) => (
            <div key={place.name} className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
              <Image src={place.image} alt={place.name} width={900} height={700} className="h-52 w-full object-cover" />
              <div className="flex items-center justify-between p-4">
                <div>
                  <p className="text-lg font-semibold text-slate-900">{place.name}</p>
                  <p className="text-sm text-slate-500">{place.state}</p>
                </div>
                <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{place.listings} homes</span>
              </div>
            </div>
          ))}
        </div>
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

      <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
        <div className="mb-6">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Testimonials</p>
          <h2 className="mt-2 text-3xl font-bold text-slate-900">What people are saying</h2>
        </div>
        <div className="grid gap-5 md:grid-cols-2">
          {testimonials.map((item) => (
            <blockquote key={item.name} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="mb-3 flex items-center gap-1 text-amber-400">
                {Array.from({ length: 5 }).map((_, index) => (
                  <Star key={index} size={15} fill="currentColor" />
                ))}
              </div>
              <p className="text-lg text-slate-700">“{item.quote}”</p>
              <footer className="mt-5 text-sm font-semibold text-slate-900">{item.name}</footer>
            </blockquote>
          ))}
        </div>
      </section>

      <footer className="mt-10 border-t border-slate-200 bg-white">
        <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 md:grid-cols-4 lg:px-8">
          <div>
            <p className="text-xl font-bold text-slate-900">Nigerian Homes</p>
            <p className="mt-3 text-sm text-slate-600">The modern property marketplace for finding, financing, and managing homes across Nigeria.</p>
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
            <p className="font-semibold text-slate-900">Nigeria</p>
            <ul className="mt-3 space-y-2 text-sm text-slate-600">
              <li>Abuja</li>
              <li>Lagos</li>
              <li>Port Harcourt</li>
              <li>Kano</li>
            </ul>
          </div>
        </div>
      </footer>
    </main>
  );
}
