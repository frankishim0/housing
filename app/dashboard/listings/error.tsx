'use client';

export default function ListingsError({ reset }: { error: Error; reset: () => void }) {
  return (
    <main className="mx-auto max-w-3xl px-4 py-16 text-center">
      <h1 className="text-2xl font-bold text-slate-900">We couldn&apos;t load your listings</h1>
      <p className="mt-2 text-sm text-slate-500">Please try again in a moment.</p>
      <button type="button" onClick={reset} className="mt-5 rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white">Try again</button>
    </main>
  );
}
