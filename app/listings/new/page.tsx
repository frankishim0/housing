import Link from 'next/link';
import { ListingForm } from '@/components/listing-form';

export default function NewListingPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <div className="mb-8">
        <Link href="/dashboard/listings" className="text-sm font-semibold text-emerald-700">← My Listings</Link>
        <p className="mt-4 text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Listings</p>
        <h1 className="mt-2 text-4xl font-bold text-slate-900">Create a new property listing</h1>
      </div>
      <ListingForm />
    </main>
  );
}
