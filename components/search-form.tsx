'use client';

import { useState } from 'react';
import { SearchableCountrySelect } from '@/components/searchable-country-select';
import { CurrencySelect } from '@/components/currency-select';
import { DeviceLocationButton } from '@/components/device-location-button';
import { LocationSearchInput } from '@/components/location-search-input';

const propertyOptions = ['Apartment', 'House', 'Villa', 'Duplex', 'Condo', 'Townhouse', 'Studio', 'Penthouse', 'Land', 'Office', 'Shop/Retail', 'Warehouse', 'Commercial property', 'Industrial property', 'Other'];
const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none transition focus:border-emerald-700';

export function SearchForm({ compact = false, initialValues = {} }: { compact?: boolean; initialValues?: Record<string, string | undefined> }) {
  const [countryCode, setCountryCode] = useState(initialValues.countryCode ?? '');
  return (
    <form action="/search" method="get" className={compact ? 'space-y-4' : 'rounded-lg border border-slate-200 bg-white p-5'}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block text-sm font-medium text-slate-700 sm:col-span-2">
          <span className="mb-1.5 block">Country, city, neighborhood, or postal code</span>
          <LocationSearchInput defaultValue={initialValues.location ?? ''} defaultLatitude={initialValues.latitude ?? ''} defaultLongitude={initialValues.longitude ?? ''} className={inputClass} onCountryChange={setCountryCode} />
        </label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Country</span><SearchableCountrySelect value={countryCode} onChange={setCountryCode} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">City</span><input name="city" defaultValue={initialValues.city ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Buy / rent / lease</span>
          <select name="listingType" defaultValue={initialValues.listingType ?? ''} className={inputClass}>
            <option value="">Any listing</option><option value="SALE">For sale</option><option value="RENT">For rent</option><option value="SHORT_TERM_RENT">Short-term rental</option><option value="LONG_TERM_RENT">Long-term rental</option><option value="LEASE">Lease</option>
          </select>
        </label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Property type</span>
          <select name="type" defaultValue={initialValues.type ?? ''} className={inputClass}><option value="">Any type</option>{propertyOptions.map((option) => <option key={option}>{option}</option>)}</select>
        </label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Listing price currency</span><CurrencySelect name="currency" defaultValue={initialValues.currency ?? ''} required={false} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Sort results</span><select name="sort" defaultValue={initialValues.sort ?? 'newest'} className={inputClass}><option value="newest">Newest listings</option><option value="price_asc">Lowest original price</option><option value="price_desc">Highest original price</option></select></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Minimum price (original currency)</span><input type="number" name="minPrice" min="0" step="any" defaultValue={initialValues.minPrice ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Maximum price (original currency)</span><input type="number" name="maxPrice" min="0" step="any" defaultValue={initialValues.maxPrice ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Bedrooms</span><select name="bedrooms" defaultValue={initialValues.bedrooms ?? ''} className={inputClass}><option value="">Any</option>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number}+</option>)}</select></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Bathrooms</span><select name="bathrooms" defaultValue={initialValues.bathrooms ?? ''} className={inputClass}><option value="">Any</option>{[1, 2, 3, 4, 5].map((number) => <option key={number} value={number}>{number}+</option>)}</select></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Minimum size</span><input type="number" name="minSize" min="0" step="any" defaultValue={initialValues.minSize ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Maximum size</span><input type="number" name="maxSize" min="0" step="any" defaultValue={initialValues.maxSize ?? ''} className={inputClass} /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Size unit</span><select name="sizeUnit" defaultValue={initialValues.sizeUnit ?? ''} className={inputClass}><option value="">Any unit</option><option value="SQUARE_METERS">Square meters</option><option value="SQUARE_FEET">Square feet</option><option value="ACRES">Acres</option><option value="HECTARES">Hectares</option></select></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-1.5 block">Minimum year built</span><input type="number" name="yearBuiltFrom" min="1000" max={new Date().getFullYear()} defaultValue={initialValues.yearBuiltFrom ?? ''} className={inputClass} /></label>
      </div>
      <details className="border-t border-slate-100 pt-3">
        <summary className="cursor-pointer text-sm font-semibold text-slate-700">More filters</summary>
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block text-sm text-slate-700"><span className="mb-1.5 block">Furnishing</span><select name="furnished" defaultValue={initialValues.furnished ?? ''} className={inputClass}><option value="">Any</option><option value="true">Furnished</option><option value="false">Unfurnished</option></select></label>
          <label className="block text-sm text-slate-700"><span className="mb-1.5 block">Minimum parking spaces</span><input type="number" name="parkingSpaces" min="0" defaultValue={initialValues.parkingSpaces ?? ''} className={inputClass} /></label>
          <label className="block text-sm text-slate-700"><span className="mb-1.5 block">Amenities</span><input name="amenity" defaultValue={initialValues.amenity ?? ''} placeholder="Pool, parking, security…" className={inputClass} /></label>
          <label className="block text-sm text-slate-700"><span className="mb-1.5 block">Location radius (km)</span><input type="number" name="radiusKm" min="1" max="500" defaultValue={initialValues.radiusKm ?? ''} className={inputClass} /></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="hasPool" value="true" defaultChecked={initialValues.hasPool === 'true'} className="h-4 w-4 accent-emerald-700" /> Pool</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="hasSecurity" value="true" defaultChecked={initialValues.hasSecurity === 'true'} className="h-4 w-4 accent-emerald-700" /> Security</label>
        </div>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <DeviceLocationButton />
        <button type="submit" className="rounded-md bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-emerald-900">Search properties</button>
      </div>
    </form>
  );
}