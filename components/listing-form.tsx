'use client';

import { FormEvent, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { CountrySelect } from '@/components/country-select';
import { CurrencySelect } from '@/components/currency-select';
import { PropertyLocationPicker } from '@/components/property-location-picker';
import { getCountryCurrency } from '@/lib/international';

const PROPERTY_TYPES = ['Apartment', 'House', 'Villa', 'Duplex', 'Condo', 'Townhouse', 'Studio', 'Penthouse', 'Land', 'Office', 'Shop/Retail', 'Warehouse', 'Commercial property', 'Industrial property', 'Other'];

export type ListingFormInitial = {
  id: string;
  title: string;
  description: string;
  type: string;
  listingType: string;
  price: number;
  currencyCode: string;
  bedrooms: number;
  bathrooms: number;
  size: number;
  sizeUnit: string;
  countryCode: string;
  region: string;
  city: string;
  neighborhood: string;
  postalCode: string;
  address: string;
  latitude: number | null;
  longitude: number | null;
  hideExactAddress: boolean;
  amenities: string[];
  parkingSpaces: number | null;
  yearBuilt: number | null;
  furnished: boolean | null;
  hasPool: boolean;
  hasSecurity: boolean;
  luxury: boolean;
  media: { id: string; url: string; type: string; fileName: string | null; isCover: boolean }[];
};

export function ListingForm({ initial }: { initial?: ListingFormInitial }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [pending, setPending] = useState(false);
  const [countryCode, setCountryCode] = useState(initial?.countryCode ?? '');
  const [currencyCode, setCurrencyCode] = useState(initial?.currencyCode ?? 'USD');
  const editing = Boolean(initial);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setSuccess('');
    const form = new FormData(event.currentTarget);
    const value = (name: string) => String(form.get(name) ?? '').trim();
    const optionalNumber = (name: string) => value(name) === '' ? null : Number(value(name));
    const amenities = value('amenities').split(',').map((item) => item.trim()).filter(Boolean);
    const common = {
      title: value('title'),
      description: value('description'),
      type: value('type'),
      listingType: value('listingType'),
      price: Number(value('price')),
      bedrooms: Number(value('bedrooms')),
      bathrooms: Number(value('bathrooms')),
      size: Number(value('size')),
      sizeUnit: value('sizeUnit'),
      parkingSpaces: optionalNumber('parkingSpaces'),
      yearBuilt: optionalNumber('yearBuilt'),
      furnished: value('furnished') === '' ? null : value('furnished') === 'true',
      hasPool: form.has('hasPool'),
      hasSecurity: form.has('hasSecurity'),
      luxury: form.has('luxury'),
      amenities,
    };
    const payload = editing
      ? {
          ...common,
          location: {
            countryCode: value('countryCode'),
            region: value('region'),
            city: value('city'),
            neighborhood: value('neighborhood'),
            postalCode: value('postalCode'),
            address: value('address'),
            latitude: optionalNumber('latitude'),
            longitude: optionalNumber('longitude'),
            hideExactAddress: form.has('hideExactAddress'),
          },
        }
      : {
          ...common,
          parkingSpaces: value('parkingSpaces'),
          yearBuilt: value('yearBuilt'),
          furnished: value('furnished'),
          countryCode,
          region: value('region'),
          city: value('city'),
          neighborhood: value('neighborhood'),
          postalCode: value('postalCode'),
          address: value('address'),
          latitude: value('latitude'),
          longitude: value('longitude'),
          hideExactAddress: form.has('hideExactAddress'),
          currencyCode,
        };

    let createdPropertyId: string | undefined;
    try {
      const endpoint = initial ? `/api/properties/${initial.id}` : '/api/properties';
      const response = await fetch(endpoint, {
        method: initial ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        const message = typeof result.error === 'string' ? result.error : 'Unable to save listing details.';
        throw new Error(message);
      }

      if (!editing) {
        const propertyId = result.data.id as string;
        createdPropertyId = propertyId;
        const mediaFiles = form.getAll('media').filter((entry): entry is File => entry instanceof File && entry.size > 0);
        for (const file of mediaFiles) {
          const signResponse = await fetch('/api/uploads/sign', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ purpose: { kind: 'property', propertyId, mediaScope: 'creation' }, fileName: file.name, mimeType: file.type, size: file.size }),
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
          if (signed.deliveryType === 'authenticated') uploadForm.set('type', signed.deliveryType);
          uploadForm.set('signature', signed.signature);
          const uploadResponse = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(signed.cloudName)}/${signed.resourceType}/upload`, { method: 'POST', body: uploadForm });
          const uploadResult = await uploadResponse.json();
          if (!uploadResponse.ok) throw new Error('Cloudinary could not upload the listing media.');
          const saveResponse = await fetch(`/api/properties/${propertyId}/media`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ticket: signed.ticket, fileName: file.name, mimeType: file.type, size: file.size, secureUrl: uploadResult.secure_url, publicId: uploadResult.public_id, resourceType: signed.resourceType, mediaScope: 'creation' }),
          });
          const saveResult = await saveResponse.json();
          if (!saveResponse.ok) throw new Error(typeof saveResult.error === 'string' ? saveResult.error : 'Could not attach uploaded media to the listing.');
        }
        router.push('/dashboard');
        router.refresh();
      } else {
        setSuccess('Listing details saved. Its current review/publication status has not been changed.');
        router.refresh();
      }
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : 'Unable to save listing details.';
      setError(!editing && createdPropertyId ? `The listing was created, but its media upload failed: ${message}` : message);
    } finally {
      setPending(false);
    }
  }

  return (
    <form ref={formRef} onSubmit={submit} className="space-y-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
      <section className="grid gap-5 md:grid-cols-2">
        <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Property title</span><input name="title" required defaultValue={initial?.title} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Property type</span><select name="type" defaultValue={initial?.type ?? 'Apartment'} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">{initial?.type && !PROPERTY_TYPES.includes(initial.type) && <option value={initial.type}>{initial.type}</option>}{PROPERTY_TYPES.map((type) => <option key={type}>{type}</option>)}</select></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Listing type</span><select name="listingType" defaultValue={initial?.listingType ?? 'RENT'} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="RENT">For rent</option><option value="SALE">For sale</option><option value="SHORT_TERM_RENT">Short-term rental</option><option value="LONG_TERM_RENT">Long-term rental</option><option value="LEASE">Lease</option></select></label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Description</span><textarea name="description" required defaultValue={initial?.description} className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
      </section>

      <section className="grid gap-5 md:grid-cols-3">
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Country</span><CountrySelect required value={countryCode} onChange={(value) => { setCountryCode(value); if (!editing) setCurrencyCode(value ? getCountryCurrency(value) : 'USD'); }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">State / Province / Region</span><input name="region" required defaultValue={initial?.region} autoComplete="address-level1" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">City</span><input name="city" required defaultValue={initial?.city} autoComplete="address-level2" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">District / Neighborhood</span><input name="neighborhood" required defaultValue={initial?.neighborhood} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Postal / ZIP code</span><input name="postalCode" defaultValue={initial?.postalCode} autoComplete="postal-code" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Address</span><input name="address" required defaultValue={initial?.address} autoComplete="street-address" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <PropertyLocationPicker initialCoordinates={initial?.latitude !== null && initial?.latitude !== undefined && initial?.longitude !== null && initial?.longitude !== undefined ? { latitude: initial.latitude, longitude: initial.longitude } : undefined} onSelect={(place) => {
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
            if (!editing) setCurrencyCode(getCountryCurrency(place.countryCode));
          }
          if (place.region) setField('region', place.region);
          if (place.city) setField('city', place.city);
          if (place.neighborhood) setField('neighborhood', place.neighborhood);
          if (place.postalCode) setField('postalCode', place.postalCode);
        }} />
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Latitude (optional)</span><input name="latitude" type="number" min="-90" max="90" step="any" defaultValue={initial?.latitude ?? ''} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Longitude (optional)</span><input name="longitude" type="number" min="-180" max="180" step="any" defaultValue={initial?.longitude ?? ''} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="flex items-center gap-2 text-sm text-slate-700 md:col-span-2"><input type="checkbox" name="hideExactAddress" value="true" defaultChecked={initial?.hideExactAddress} className="h-4 w-4 accent-emerald-700" /> Hide the exact address on the public map</label>
      </section>

      <section className="grid gap-5 md:grid-cols-4">
        <div className="text-sm font-medium text-slate-700"><span className="mb-2 block">Original listing currency</span>{editing ? <p className="rounded-2xl border border-slate-200 bg-slate-100 px-4 py-3">{initial?.currencyCode} Â· fixed for this listing</p> : <CurrencySelect name="currencyCode" value={currencyCode} onChange={setCurrencyCode} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" />}<span className="mt-1 block text-xs text-slate-500">Saved as the property&apos;s original currency; converted prices are display-only.</span></div>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Price</span><input name="price" type="number" min="0" step="any" required defaultValue={initial?.price} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Bedrooms</span><input name="bedrooms" type="number" min="0" required defaultValue={initial?.bedrooms} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Bathrooms</span><input name="bathrooms" type="number" min="0" required defaultValue={initial?.bathrooms} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Property size</span><input name="size" type="number" min="1" step="any" required defaultValue={initial?.size} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Size unit</span><select name="sizeUnit" defaultValue={initial?.sizeUnit ?? 'SQUARE_METERS'} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="SQUARE_METERS">Square meters (mÂ²)</option><option value="SQUARE_FEET">Square feet (ftÂ²)</option><option value="ACRES">Acres</option><option value="HECTARES">Hectares</option></select></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Year built</span><input name="yearBuilt" type="number" min="1000" max={new Date().getFullYear()} defaultValue={initial?.yearBuilt ?? ''} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Parking spaces</span><input name="parkingSpaces" type="number" min="0" defaultValue={initial?.parkingSpaces ?? ''} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Furnishing</span><select name="furnished" defaultValue={initial?.furnished === null || initial?.furnished === undefined ? '' : String(initial.furnished)} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="">Not specified</option><option value="true">Furnished</option><option value="false">Unfurnished</option></select></label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="hasPool" value="true" defaultChecked={initial?.hasPool} className="h-4 w-4 accent-emerald-700" /> Pool</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="hasSecurity" value="true" defaultChecked={initial?.hasSecurity} className="h-4 w-4 accent-emerald-700" /> Security</label>
        <label className="flex items-center gap-2 text-sm text-slate-700"><input type="checkbox" name="luxury" value="true" defaultChecked={initial?.luxury} className="h-4 w-4 accent-emerald-700" /> Luxury property</label>
        <label className="block text-sm font-medium text-slate-700 md:col-span-4"><span className="mb-2 block">Amenities (comma separated)</span><input name="amenities" defaultValue={initial?.amenities.join(', ')} placeholder="Security, Generator, Parking" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
      </section>

      {editing ? null : (
        <section className="space-y-2">
          <label className="block text-sm font-medium text-slate-700" htmlFor="listing-media">Listing photos, walkthrough videos, or property documents</label>
          <input id="listing-media" name="media" type="file" multiple accept="image/jpeg,image/png,image/webp,image/avif,video/mp4,video/webm,video/quicktime,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document" className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm" />
          <p className="text-xs text-slate-500">Files are uploaded directly to secure cloud storage. Images/documents up to 20 MB, videos up to 200 MB.</p>
        </section>
      )}

      {error && <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {success && <p role="status" className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800">{success}</p>}
      <div className="flex flex-wrap justify-end gap-3"><button disabled={pending} type="submit" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Savingâ€¦' : editing ? 'Save changes' : 'Create listing'}</button></div>
    </form>
  );
}
