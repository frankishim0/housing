'use client';

import { FormEvent, useState } from 'react';

export function AdminDisputeForm({ disputeId, status: initialStatus, resolution: initialResolution }: { disputeId: string; status: string; resolution: string | null }) {
  const [status, setStatus] = useState(initialStatus);
  const [resolution, setResolution] = useState(initialResolution ?? '');
  const [reason, setReason] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setError('');
    setMessage('');
    try {
      const response = await fetch(`/api/admin/monetization/disputes/${encodeURIComponent(disputeId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, resolution, reason }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to update dispute.');
      setMessage('Dispute update and resolution were audited.');
      setReason('');
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update dispute.');
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} className="mt-3 grid gap-2 rounded-xl bg-slate-50 p-3">
      <div className="grid gap-2 sm:grid-cols-[1fr_2fr]">
        <select value={status} onChange={(event) => setStatus(event.target.value)} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm">
          <option>OPEN</option><option>UNDER_REVIEW</option><option>RESOLVED</option><option>REJECTED</option>
        </select>
        <textarea required minLength={10} maxLength={2000} value={resolution} onChange={(event) => setResolution(event.target.value)} placeholder="Resolution or investigation notes" className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm" />
      </div>
      <div className="flex flex-wrap gap-2">
        <input required minLength={10} maxLength={500} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Reason for this status change" className="min-w-52 flex-1 rounded-lg border border-slate-200 px-3 py-2 text-sm" />
        <button disabled={pending} className="rounded-full bg-slate-800 px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">{pending ? 'Saving…' : 'Update dispute'}</button>
      </div>
      {message && <p role="status" className="text-xs text-emerald-800">{message}</p>}
      {error && <p role="alert" className="text-xs text-red-700">{error}</p>}
    </form>
  );
}
