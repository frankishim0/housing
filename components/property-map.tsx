'use client';

import dynamic from 'next/dynamic';
import type { Property } from '@/lib/types';

const PropertyMapClient = dynamic(() => import('@/components/property-map-client').then((module) => module.PropertyMapClient), { ssr: false, loading: () => <div className="h-[560px] animate-pulse rounded-lg bg-slate-100" /> });

export function PropertyMap({ properties, preferredCurrency = 'USD' }: { properties: Property[]; preferredCurrency?: string }) {
  return <PropertyMapClient properties={properties} preferredCurrency={preferredCurrency} />;
}
