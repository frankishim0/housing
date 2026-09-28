'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CountrySelect } from '@/components/country-select';
import { CurrencySelect } from '@/components/currency-select';
import { PropertyLocationPicker } from '@/components/property-location-picker';
import { getCountryCurrency } from '@/lib/international';

export default function NewListingPage() {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const [countryCode, setCountryCode] = useState('');
  const [currencyCode, setCurrencyCode] = useState('USD');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const mediaFiles = form.getAll('media').filter((entry): entry is File => entry instanceof File && entry.size > 0);
    const payload = Object.fromEntries([...form.entries()].filter(([key]) => key !== 'media'));
    payload.price = Number(payload.price) as unknown as string;
    payload.bedrooms = Number(payload.bedrooms) as unknown as string;
    payload.bathrooms = Number(payload.bathrooms) as unknown as string;
    payload.size = Number(payload.size) as unknown as string;
    payload.amenities = String(payload.amenities ?? '').split(',').map((item) => item.trim()).filter(Boolean) as unknown as string;

    const response = await fetch('/api/properties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const result = await response.json();
    if (!response.ok) {
      setPending(false);
      setError(typeof result.error === 'string' ? result.error : 'Unable to create listing.');
      return;
    }
    const propertyId = result.data.id as string;
    try {
      for (const file of mediaFiles) {
        const signResponse = await fetch('/api/uploads/sign', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ purpose: { kind: 'property', propertyId }, fileName: file.name, mimeType: file.type, size: file.size }),
        });
        const signResult = await signResponse.json();
        if (!signResponse.ok) throw new Error(typeof signResult.error === 'string' ? signResult.error : 'Could not authorize listing media upload.');
        const signed = signResult.data;
        const uploadForm = new FormData();
        uploadForm.set('file', file);
        uploadForm.set('api_key', signed.apiKey);
        uploadForm.set('timestamp', String(signed.timestamp));
        uploadForm.set('folder', signed.folder);
        uploadForm.set('public_id', signed.publicId);
        uploadForm.set('overwrite', 'false');
        uploadForm.set('signature', signed.signature);
        const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${signed.resourceType}/upload`, { method: 'POST', body: uploadForm });
        const uploadResult = await uploadResponse.json();
        if (!uploadResponse.ok) throw new Error('Cloudinary could not upload the listing media.');
        const saveResponse = await fetch(`/api/properties/${propertyId}/media`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ticket: signed.ticket,
            fileName: file.name,
            mimeType: file.type,
            size: file.size,
            secureUrl: uploadResult.secure_url,
            publicId: uploadResult.public_id,
            resourceType: signed.resourceType,
          }),
        });
        const saveResult = await saveResponse.json();
        if (!saveResponse.ok) throw new Error(typeof saveResult.error === 'string' ? saveResult.error : 'Could not attach uploaded media to the listing.');
      }
    } catch (uploadError) {
      setPending(false);
      setError(uploadError instanceof Error ? `The listing was created, but its media upload failed: ${uploadError.message}` : 'The listing was created, but media upload failed.');
      return;
    }
    setPending(false);
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Listings</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Create a new property listing</h1>
      </div>

      <form ref={formRef} onSubmit={submit} className="space-y-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <section className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Property title</span><input name="title" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Property type</span><select name="type" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option>Apartment</option><option>House</option><option>Villa</option><option>Duplex</option><option>Condo</option><option>Townhouse</option><option>Studio</option><option>Penthouse</option><option>Land</option><option>Office</option><option>Shop/Retail</option><option>Warehouse</option><option>Commercial property</option><option>Industrial property</option><option>Other</option></select></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Listing type</span><select name="listingType" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="RENT">For rent</option><option value="SALE">For sale</option><option value="SHORT_TERM_RENT">Short-term rental</option><option value="LONG_TERM_RENT">Long-term rental</option><option value="LEASE">Lease</option></select></label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Description</span><textarea name="description" required className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Country</span><CountrySelect required value={countryCode} onChange={(value) => {
            setCountryCode(value);
            setCurrencyCode(value ? getCountryCurrency(value) : 'USD');
          }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">State / Province / Region</span><input name="region" required autoComplete="address-level1" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">City</span><input name="city" required autoComplete="address-level2" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">District / Neighborhood</span><input name="neighborhood" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Postal / ZIP code</span><input name="postalCode" autoComplete="postal-code" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Address</span><input name="address" required autoComplete="street-address" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <PropertyLocationPicker onSelect={(place) => {
            const elements = formRef.current?.elements;
            if (!elements) return;
            const setField = (name: string, value: string | number) => {
              const field = elements.namedItem(name);
              if (field instanceof HTMLInputElement || field instanceof HTMLSelectElement) field.value = String(value);
            };
            setField('latitude', place.latitude);
            setField('longitude', place.longitude);
            setField('address', place.label);
            if (place.countryCode) {
              setField('countryCode', place.countryCode);
              setCountryCode(place.countryCode);
              setCurrencyCode(getCountryCurrency(place.countryCode));
            }
            if (place.region) setField('region', place.region);
            if (place.city) setField('city', place.city);
            if (place.neighborhood) setField('neighborhood', place.neighborhood);
            if (place.postalCode) setField('postalCode', place.postalCode);
          }} />
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Latitude (optional)</span><input name="latitude" type="number" min="-90" max="90" step="any" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Longitude (optional)</span><input name="longitude" type="number" min="-180" max="180" step="any" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2"><input type="checkbox" name="hideExactAddress" value="true" className="h-4 w-4 accent-emerald-700" /> Hide the exact address on the public map</label>
        </section>

        <section className="grid gap-5 md:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Original listing currency</span><CurrencySelect name="currencyCode" value={currencyCode} onChange={setCurrencyCode} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /><span className="mt-1 block text-xs text-slate-500">Saved as the property&apos;s original currency; converted prices are display-only.</span></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Price</span><input name="price" type="number" min="0" step="any" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Bedrooms</span><input name="bedrooms" type="number" min="0" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Bathrooms</span><input name="bathrooms" type="number" min="0" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Property size</span><input name="size" type="number" min="1" step="any" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Size unit</span><select name="sizeUnit" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="SQUARE_METERS">Square meters (m²)</option><option value="SQUARE_FEET">Square feet (ft²)</option><option value="ACRES">Acres</option><option value="HECTARES">Hectares</option></select></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Year built</span><input name="yearBuilt" type="number" min="1000" max={new Date().getFullYear()} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Parking spaces</span><input name="parkingSpaces" type="number" min="0" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Furnishing</span><select name="furnished" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="">Not specified</option><option value="true">Furnished</option><option value="false">Unfurnished</option></select></label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="hasPool" value="true" className="h-4 w-4 accent-emerald-700" /> Pool</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="hasSecurity" value="true" className="h-4 w-4 accent-emerald-700" /> Security</label>
          <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="luxury" value="true" className="h-4 w-4 accent-emerald-700" /> Luxury property</label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-4"><span className="mb-2 block">Amenities (comma separated)</span><input name="amenities" placeholder="Security, Generator, Parking" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        </section>

        <section className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="listing-media">Listing photos, walkthrough videos, or property documents</label>
          <input id="listing-media" name="media" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          <p className="text-xs text-slate-500">Files are uploaded directly to secure cloud storage. Images/documents up to 20 MB, videos up to 200 MB.</p>
        </section>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end"><button disabled={pending} type="submit" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Creating…' : 'Create listing'}</button></div>
      </form>
    </main>
  );
}
