import Image from 'next/image';
import Link from 'next/link';
import { Bath, BedDouble, CarFront, Check, MapPin, Share2, ShieldCheck, Star } from 'lucide-react';
import { notFound } from 'next/navigation';
import { formatCurrency } from '@/lib/format';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';
import { FavoriteButton } from '@/components/favorite-button';
import { PropertyContactActions } from '@/components/property-contact-actions';

export const dynamic = 'force-dynamic';

export default async function PropertyDetailsPage({ params }: { params: Promise<{ slug: string }> }) {
  const propertyRecord = await prisma.property.findFirst({
    where: { OR: [{ slug: (await params).slug }, { id: (await params).slug }], status: { notIn: ['DRAFT', 'SUSPENDED'] } },
    include: { location: true, media: true, amenities: true, owner: true, agent: true },
  });

  if (!propertyRecord) {
    notFound();
  }
  const property = presentProperty(propertyRecord);

  const similarRecords = await prisma.property.findMany({
    where: { id: { not: property.id }, status: 'PUBLISHED', location: { city: property.location.city } },
    include: { location: true, media: true, amenities: true, owner: true, agent: true },
    take: 3,
  });
  const similar = similarRecords.map((item) => presentProperty(item));

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-slate-600">
          <Link href="/">Home</Link>
          <span>/</span>
          <Link href="/search">Search</Link>
          <span>/</span>
          <span className="text-slate-900">{property.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <FavoriteButton propertyId={property.id} />
          <button className="rounded-full border border-slate-200 bg-white p-2 text-slate-700"><Share2 size={16} /></button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_0.8fr]">
        <div>
          <div className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
            <Image src={property.image} alt={property.title} width={1200} height={900} className="h-[420px] w-full object-cover" />
          </div>

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            {property.images.map((image, index) => (
              <Image key={`${image}-${index}`} src={image} alt={`${property.title} ${index + 1}`} width={600} height={400} className="h-36 w-full rounded-2xl object-cover" />
            ))}
          </div>

          <div className="mt-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="mb-2 flex items-center gap-2">
                  <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">{property.tag}</span>
                  {property.verified && (
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
                      <ShieldCheck size={12} /> Verified
                    </span>
                  )}
                </div>
                <h1 className="text-3xl font-bold text-slate-900">{property.title}</h1>
              </div>
              <div className="text-right">
                <p className="text-3xl font-bold text-slate-900">{formatCurrency(property.price)}</p>
                <p className="text-sm text-slate-500">{property.listingType} • {property.status}</p>
              </div>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-4">
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><MapPin size={16} /> Location</div><p className="mt-2 font-semibold text-slate-900">{property.location.area}, {property.location.city}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><BedDouble size={16} /> Bedrooms</div><p className="mt-2 font-semibold text-slate-900">{property.bedrooms}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><Bath size={16} /> Bathrooms</div><p className="mt-2 font-semibold text-slate-900">{property.bathrooms}</p></div>
              <div className="rounded-2xl bg-slate-50 p-4"><div className="flex items-center gap-2 text-slate-500"><CarFront size={16} /> Size</div><p className="mt-2 font-semibold text-slate-900">{property.size} m²</p></div>
            </div>

            <div className="mt-8">
              <h2 className="text-2xl font-semibold text-slate-900">Description</h2>
              <p className="mt-4 text-slate-600">{property.description}</p>
            </div>

            <div className="mt-8">
              <h3 className="text-xl font-semibold text-slate-900">Amenities</h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {property.amenities.map((amenity) => (
                  <span key={amenity} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">{amenity}</span>
                ))}
              </div>
            </div>

            <div className="mt-8 grid gap-6 lg:grid-cols-2">
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Property features</h3>
                <ul className="mt-4 space-y-3 text-slate-600">
                  {['Verified ownership', 'Secure estate', 'Near schools and shops', 'Flexible payment options'].map((feature) => (
                    <li key={feature} className="flex items-center gap-2"><Check size={16} className="text-emerald-600" /> {feature}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h3 className="text-xl font-semibold text-slate-900">Availability</h3>
                <div className="mt-4 rounded-2xl bg-emerald-50 p-4 text-emerald-700">
                  <p className="font-semibold">{property.status}</p>
                  <p className="mt-1 text-sm">Available for viewing and negotiation</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <aside className="space-y-6">
          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-4">
              <Image src={property.owner.avatar} alt={property.owner.name} width={120} height={120} className="h-16 w-16 rounded-full object-cover" />
              <div>
                <p className="text-xl font-semibold text-slate-900">{property.owner.name}</p>
                <p className="text-sm text-slate-500">{property.owner.company}</p>
                <div className="mt-1 flex items-center gap-1 text-amber-500">
                  <Star size={14} fill="currentColor" />
                  <span className="text-sm font-medium text-slate-700">{property.owner.rating}</span>
                </div>
              </div>
            </div>

            <div className="mt-6">
              <PropertyContactActions propertyId={property.id} />
            </div>
          </div>

          <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
            <h3 className="text-xl font-semibold text-slate-900">Similar properties</h3>
            <div className="mt-5 space-y-4">
              {similar.map((item) => (
                <Link key={item.id} href={`/properties/${item.slug}`} className="flex gap-3 rounded-2xl border border-slate-200 p-3">
                  <Image src={item.image} alt={item.title} width={220} height={160} className="h-20 w-20 rounded-xl object-cover" />
                  <div className="flex-1">
                    <p className="font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-1 text-sm text-slate-500">{item.location.area}</p>
                    <p className="mt-2 font-bold text-slate-900">{formatCurrency(item.price)}</p>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </main>
  );
}
