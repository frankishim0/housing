'use client';

import Link from 'next/link';

export default function EditListingError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">We couldn&apos;t load this listing</h1>
      <p className="mt-2 text-sm text-slate-500">Please try again, or return to My Listings.</p>
      <div className="mt-5 flex justify-center gap-3">
        <button type="button" onClick={reset} className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white">Try again</button>
        <Link href="/dashboard/listings" className="rounded-full border border-slate-300 px-5 py-3 text-sm font-semibold text-slate-700">My Listings</Link>
      </div>
    </main>
  );
}
