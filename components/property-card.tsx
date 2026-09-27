import Image from 'next/image';
import Link from 'next/link';
import { Bath, BedDouble, MapPin, ShieldCheck } from 'lucide-react';
import type { Property } from '@/lib/types';
import { formatCurrency } from '@/lib/format';
import { FavoriteButton } from '@/components/favorite-button';

export function PropertyCard({ property }: { property: Property }) {
  return (
    <article className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm transition hover:-translate-y-1 hover:shadow-xl">
      <div className="relative">
        <Image src={property.image} alt={property.title} width={800} height={600} className="h-60 w-full object-cover" />
        <div className="absolute left-4 top-4 flex items-center gap-2">
          <span className="rounded-full bg-white/90 px-2.5 py-1 text-xs font-semibold text-slate-900">
            {property.tag}
          </span>
          {property.verified && (
            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white">
              <ShieldCheck size={12} /> Verified
            </span>
          )}
        </div>
        <FavoriteButton propertyId={property.id} initialFavorite={property.favorite} />
      </div>

      <div className="space-y-4 p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-xl font-semibold text-slate-900">{property.title}</h3>
            <p className="mt-1 flex items-center gap-1 text-sm text-slate-500">
              <MapPin size={14} /> {property.location.area}, {property.location.city}
            </p>
          </div>
          <div className="rounded-full bg-slate-100 px-2 py-1 text-xs font-semibold text-slate-700">
            {property.listingType}
          </div>
        </div>

        <div className="flex items-end justify-between">
          <div>
            <p className="text-2xl font-bold text-slate-900">{formatCurrency(property.price)}</p>
            <p className="text-xs text-slate-500">{property.status}</p>
          </div>
          <Link href={`/properties/${property.slug}`} className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-emerald-700">
            View details
          </Link>
        </div>

        <div className="flex items-center justify-between border-t border-slate-200 pt-4 text-sm text-slate-600">
          <span className="inline-flex items-center gap-1"><BedDouble size={15} /> {property.bedrooms} beds</span>
          <span className="inline-flex items-center gap-1"><Bath size={15} /> {property.bathrooms} baths</span>
          <span>{property.size} m²</span>
        </div>
      </div>
    </article>
  );
}
