'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function NewListingPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
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
    setPending(false);
    if (!response.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Unable to create listing.');
      return;
    }
    router.push('/dashboard');
    router.refresh();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <div className="mb-8">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Listings</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Create a new property listing</h1>
      </div>

      <form onSubmit={submit} className="space-y-8 rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm lg:p-8">
        <section className="grid gap-5 md:grid-cols-2">
          <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Property title</span><input name="title" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Property type</span><select name="type" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option>Apartment</option><option>House</option><option>Duplex</option><option>Terrace</option><option>Penthouse</option><option>Land</option></select></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Listing type</span><select name="listingType" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3"><option value="RENT">Rent</option><option value="SALE">Sale</option></select></label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-2"><span className="mb-2 block">Description</span><textarea name="description" required className="min-h-28 w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        </section>

        <section className="grid gap-5 md:grid-cols-3">
          {(['country', 'state', 'city', 'area', 'address'] as const).map((field) => (
            <label key={field} className={`block text-sm font-medium capitalize text-slate-700 ${field === 'address' ? 'md:col-span-2' : ''}`}><span className="mb-2 block">{field}</span><input name={field} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" defaultValue={field === 'country' ? 'Nigeria' : ''} /></label>
          ))}
        </section>

        <section className="grid gap-5 md:grid-cols-4">
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Price (₦)</span><input name="price" type="number" min="0" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Bedrooms</span><input name="bedrooms" type="number" min="0" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Bathrooms</span><input name="bathrooms" type="number" min="0" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Size (m²)</span><input name="size" type="number" min="1" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
          <label className="block text-sm font-medium text-slate-700 md:col-span-4"><span className="mb-2 block">Amenities (comma separated)</span><input name="amenities" placeholder="Security, Generator, Parking" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
        </section>

        {error && <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="flex justify-end"><button disabled={pending} type="submit" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Creating…' : 'Create listing'}</button></div>
      </form>
    </main>
  );
}
