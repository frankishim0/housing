'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { ListingActionId } from '@/lib/owner-listings';

const ACTIONS: Record<ListingActionId, { label: string; confirm: string; method?: 'PATCH' | 'DELETE'; request: (id: string) => { url: string; body?: unknown } }> = {
  archive: { label: 'Archive', confirm: 'Archive this listing? It will be hidden from the public but kept in My Listings, and you can restore it later.', request: (id) => ({ url: `/api/properties/${id}/archive`, body: { archived: true } }) },
  restore: { label: 'Restore to draft', confirm: 'Restore this listing to draft? It stays private until resubmitted and approved.', request: (id) => ({ url: `/api/properties/${id}/archive`, body: { archived: false } }) },
  delete: { label: 'Delete permanently', confirm: 'Permanently delete this draft? This cannot be undone.', method: 'DELETE', request: (id) => ({ url: `/api/properties/${id}` }) },
  submit: { label: 'Submit for review', confirm: 'Submit this listing for review?', request: (id) => ({ url: `/api/properties/${id}/publish`, body: { published: true } }) },
  resubmit: { label: 'Resubmit for review', confirm: 'Resubmit this listing for review? It will leave public view until approved.', request: (id) => ({ url: `/api/properties/${id}/publish`, body: { published: true } }) },
  return_to_draft: { label: 'Return to draft', confirm: 'Return this rejected listing to draft? It will remain private until resubmitted and approved.', request: (id) => ({ url: `/api/properties/${id}`, body: { status: 'DRAFT' } }) },
  pause: { label: 'Pause', confirm: 'Pause this listing? It will no longer be publicly visible.', request: (id) => ({ url: `/api/properties/${id}/publish`, body: { published: false } }) },
  rented: { label: 'Mark rented', confirm: 'Mark this listing as rented?', request: (id) => ({ url: `/api/properties/${id}`, body: { status: 'RENTED' } }) },
  sold: { label: 'Mark sold', confirm: 'Mark this listing as sold?', request: (id) => ({ url: `/api/properties/${id}`, body: { status: 'SOLD' } }) },
};

export function ListingActions({ propertyId, actions }: { propertyId: string; actions: ListingActionId[] }) {
  const router = useRouter();
  const [pending, setPending] = useState<ListingActionId | null>(null);
  const [error, setError] = useState('');

  async function run(action: ListingActionId) {
    const config = ACTIONS[action];
    if (!window.confirm(config.confirm)) return;
    setPending(action);
    setError('');
    try {
      const { url, body } = config.request(propertyId);
      const response = await fetch(url, { method: config.method ?? 'PATCH', ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'This action could not be completed.');
      if (action === 'delete') router.push('/dashboard/listings');
      router.refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'This action could not be completed.');
    } finally {
      setPending(null);
    }
  }

  return (
    <>
      {actions.map((action) => (
        <button key={action} type="button" disabled={pending !== null} onClick={() => void run(action)} className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-emerald-700 hover:text-emerald-800 disabled:opacity-50">
          {pending === action ? 'Working…' : ACTIONS[action].label}
        </button>
      ))}
      {error && <p role="alert" className="w-full text-xs text-red-700">{error}</p>}
    </>
  );
}
