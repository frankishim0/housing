'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

type MediaItem = { id: string; fileName: string | null; type: 'IMAGE' | 'VIDEO' | 'DOCUMENT'; isCover: boolean };

export function PropertyMediaManager({ propertyId, media }: { propertyId: string; media: MediaItem[] }) {
  const router = useRouter();
  const [error, setError] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function update(mediaId: string, method: 'PATCH' | 'DELETE') {
    setPendingId(mediaId);
    setError('');
    try {
      const response = await fetch(`/api/properties/${propertyId}/media/${mediaId}`, { method });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Could not update property media.');
      router.refresh();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Could not update property media.');
    } finally {
      setPendingId(null);
    }
  }

  if (media.length === 0) return null;
  return (
    <section className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <h3 className="font-semibold text-slate-900">Manage listing media</h3>
      {error && <p role="alert" className="mt-2 text-sm text-red-700">{error}</p>}
      <ul className="mt-3 space-y-2">
        {media.map((item) => <li key={item.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-white px-3 py-2 text-sm">
          <span className="min-w-0 flex-1 truncate">{item.fileName ?? item.type}{item.isCover ? ' · Cover image' : ''}</span>
          <div className="flex gap-2">
            {item.type === 'IMAGE' && !item.isCover && <button disabled={pendingId === item.id} onClick={() => void update(item.id, 'PATCH')} className="text-xs font-semibold text-emerald-700 disabled:opacity-50">Set cover</button>}
            <button disabled={pendingId === item.id} onClick={() => void update(item.id, 'DELETE')} className="text-xs font-semibold text-red-700 disabled:opacity-50">Delete</button>
          </div>
        </li>)}
      </ul>
    </section>
  );
}
