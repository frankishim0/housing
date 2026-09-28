'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { MapPin } from 'lucide-react';
import { CurrencyPrice } from '@/components/currency-price';

type NearbyProperty = {
  id: string;
  slug: string;
  title: string;
  price: number;
  currencyCode: string;
  location: { area: string; city: string; state: string; country: string };
  media: { id: string; url: string }[];
};

export function NearbyProperties({ preferredCurrency = 'USD' }: { preferredCurrency?: string }) {
  const [properties, setProperties] = useState<NearbyProperty[]>([]);
  const [message, setMessage] = useState('Share your location to look for nearby listings. Your coordinates are used for this search only.');
  const [loading, setLoading] = useState(false);

  function findNearby() {
    if (!navigator.geolocation) {
      setMessage('Location access is unavailable in this browser.');
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(async ({ coords }) => {
      try {
        const query = new URLSearchParams({ latitude: String(coords.latitude), longitude: String(coords.longitude), radiusKm: '25', pageSize: '4' });
        const response = await fetch(`/api/properties?${query.toString()}`, { cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw new Error('Nearby listings could not be loaded.');
        setProperties(result.data as NearbyProperty[]);
        setMessage(result.data.length ? `${result.pagination.total} listings within about 25 km.` : 'No listings with map coordinates were found nearby.');
      } catch {
        setMessage('Nearby listings could not be loaded. Try searching by city or country.');
      } finally {
        setLoading(false);
      }
    }, () => {
      setLoading(false);
      setMessage('Location permission was not granted. You can search any city or country instead.');
    }, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  return (
    <section className="mx-auto max-w-7xl px-4 py-8 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-y border-slate-200 py-5">
        <div><h2 className="text-xl font-semibold text-slate-900">Properties near you</h2><p aria-live="polite" className="mt-1 text-sm text-slate-500">{message}</p></div>
        <div className="flex gap-3"><button type="button" disabled={loading} onClick={findNearby} className="inline-flex items-center gap-2 rounded-md bg-emerald-800 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-60"><MapPin size={16} />{loading ? 'Searching…' : 'Use my location'}</button><Link href="/search" className="rounded-md border border-slate-300 px-4 py-2.5 text-sm font-semibold text-slate-700">Search anywhere</Link></div>
      </div>
      {properties.length > 0 && <ul className="divide-y divide-slate-100">{properties.map((property) => <li key={property.id} className="flex items-center gap-3 py-3">
        {property.media[0] && <Image src={property.media[0].url} alt="" width={72} height={56} className="h-14 w-[72px] rounded-md object-cover" />}
        <div className="min-w-0 flex-1"><Link href={`/properties/${property.slug}`} className="block truncate text-sm font-semibold text-slate-900 hover:text-emerald-800">{property.title}</Link><p className="truncate text-xs text-slate-500">{[property.location.area, property.location.city, property.location.country].filter(Boolean).join(', ')}</p></div>
        <Link href={`/properties/${property.slug}`} className="shrink-0 text-sm font-semibold text-emerald-800"><CurrencyPrice amount={property.price} currency={property.currencyCode} preferredCurrency={preferredCurrency} /></Link>
      </li>)}</ul>}
    </section>
  );
}
