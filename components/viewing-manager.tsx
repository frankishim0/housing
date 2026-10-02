'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, Check, Clock3, X } from 'lucide-react';

type Viewing = {
  id: string;
  status: string;
  scheduledAt: string | null;
  preferredDate: string;
  preferredTime: string;
  message: string | null;
  property: { id: string; title: string; slug: string; ownerId: string; agentId: string | null };
  requester: { id: string; name: string };
};

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function viewingDate(viewing: Viewing) {
  return viewing.scheduledAt ? new Date(viewing.scheduledAt) : new Date(`${viewing.preferredDate.slice(0, 10)}T${viewing.preferredTime}`);
}

export function ViewingManager({ userId, isAdmin, initialNow }: { userId: string; isAdmin: boolean; initialNow: string }) {
  const [viewings, setViewings] = useState<Viewing[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [proposalId, setProposalId] = useState('');
  const [proposalTime, setProposalTime] = useState('');
  const [proposalMessage, setProposalMessage] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const response = await fetch('/api/viewings?period=all', { cache: 'no-store' });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load viewings.');
      setViewings(result.data as Viewing[]);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load viewings.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/viewings?period=all', { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load viewings.');
        setViewings(result.data as Viewing[]);
      })
      .catch((loadError: unknown) => {
        if (!controller.signal.aborted) {
          setError(loadError instanceof Error ? loadError.message : 'Unable to load viewings.');
        }
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, []);

  const now = new Date(initialNow).getTime();
  const upcoming = viewings.filter((viewing) => viewingDate(viewing).getTime() >= now);
  const past = viewings.filter((viewing) => viewingDate(viewing).getTime() < now);

  async function updateViewing(viewingId: string, action: 'approve' | 'reject' | 'confirm' | 'cancel') {
    setBusyId(viewingId);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(`/api/viewings/${encodeURIComponent(viewingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to update this viewing.');
      setFeedback(`Viewing ${action === 'approve' || action === 'confirm' ? 'confirmed' : action === 'reject' ? 'declined' : 'cancelled'}.`);
      await reload();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : 'Unable to update this viewing.');
    } finally {
      setBusyId('');
    }
  }

  async function proposeTime(viewingId: string) {
    if (!proposalTime || new Date(proposalTime).getTime() <= Date.now()) {
      setError('Choose a proposed date and time in the future.');
      return;
    }
    const [preferredDate, preferredTime] = [proposalTime.slice(0, 10), proposalTime.slice(11, 16)];
    setBusyId(viewingId);
    setError('');
    setFeedback('');
    try {
      const response = await fetch(`/api/viewings/${encodeURIComponent(viewingId)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'propose',
          scheduledAt: new Date(proposalTime).toISOString(),
          preferredDate,
          preferredTime,
          timeZoneOffsetMinutes: new Date(proposalTime).getTimezoneOffset(),
          message: proposalMessage,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to propose another time.');
      setProposalId('');
      setProposalTime('');
      setProposalMessage('');
      setFeedback('New viewing time proposed and requester notified.');
      await reload();
    } catch (proposalError) {
      setError(proposalError instanceof Error ? proposalError.message : 'Unable to propose another time.');
    } finally {
      setBusyId('');
    }
  }

  function renderCard(viewing: Viewing) {
    const isManager = isAdmin || viewing.property.ownerId === userId || viewing.property.agentId === userId;
    const date = viewingDate(viewing);
    const managerCanRespond = isManager && ['REQUESTED', 'RESCHEDULED'].includes(viewing.status);
    const buyerCanRespond = !isManager && viewing.requester.id === userId
      && (viewing.status === 'REQUESTED' || viewing.status === 'RESCHEDULED');
    return (
      <article key={viewing.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <Link href={`/properties/${viewing.property.slug}`} className="font-semibold text-slate-900 hover:text-emerald-800">{viewing.property.title}</Link>
            <p className="mt-1 text-sm text-slate-600">{isManager ? `Requested by ${viewing.requester.name}` : 'Viewing request'} · <span className="font-medium">{viewing.status.replace('_', ' ')}</span></p>
          </div>
          <p className="inline-flex items-center gap-2 rounded-full bg-slate-50 px-3 py-1 text-sm text-slate-700">
            <CalendarClock size={16} /> {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(date)}
          </p>
        </div>
        {viewing.message && <p className="mt-3 whitespace-pre-wrap rounded-xl bg-slate-50 p-3 text-sm text-slate-600">{viewing.message}</p>}
        {managerCanRespond && <div className="mt-4 flex flex-wrap gap-2">
          <button type="button" disabled={busyId === viewing.id} onClick={() => void updateViewing(viewing.id, 'approve')} className="inline-flex items-center gap-1 rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"><Check size={15} /> Approve</button>
          <button type="button" disabled={busyId === viewing.id} onClick={() => void updateViewing(viewing.id, 'reject')} className="inline-flex items-center gap-1 rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-50"><X size={15} /> Decline</button>
          <button type="button" disabled={busyId === viewing.id} onClick={() => {
            setProposalId(proposalId === viewing.id ? '' : viewing.id);
            setProposalTime('');
            setProposalMessage('');
            setError('');
          }} className="inline-flex items-center gap-1 rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50"><Clock3 size={15} /> Propose another time</button>
        </div>}
        {proposalId === viewing.id && <div className="mt-3 space-y-2 rounded-xl bg-slate-50 p-4">
          <label className="block text-xs font-semibold text-slate-600">Proposed date and time
            <input type="datetime-local" value={proposalTime} onFocus={(event) => {
              event.currentTarget.min = localDateTimeValue(new Date(Date.now() + 60_000));
            }} onChange={(event) => setProposalTime(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          </label>
          <textarea value={proposalMessage} onChange={(event) => setProposalMessage(event.target.value)} maxLength={2000} placeholder="Optional note to the requester" className="min-h-20 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm" />
          <button type="button" disabled={busyId === viewing.id} onClick={() => void proposeTime(viewing.id)} className="rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Send proposed time</button>
        </div>}
        {buyerCanRespond && <div className="mt-4 flex flex-wrap gap-2">
          {viewing.status === 'RESCHEDULED' && <button type="button" disabled={busyId === viewing.id} onClick={() => void updateViewing(viewing.id, 'confirm')} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">Confirm proposed time</button>}
          <button type="button" disabled={busyId === viewing.id} onClick={() => void updateViewing(viewing.id, 'cancel')} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-50">Cancel request</button>
        </div>}
      </article>
    );
  }

  return (
    <div className="space-y-8">
      {feedback && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-900">{feedback}</p>}
      {error && <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-900">{error}</p>}
      {loading ? <p className="text-sm text-slate-500">Loading your viewings…</p> : <>
        <section>
          <h2 className="mb-4 text-xl font-bold text-slate-900">Upcoming viewings ({upcoming.length})</h2>
          <div className="space-y-3">
            {upcoming.length ? upcoming.map(renderCard) : <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No upcoming viewings.</p>}
          </div>
        </section>
        <section>
          <h2 className="mb-4 text-xl font-bold text-slate-900">Past viewings ({past.length})</h2>
          <div className="space-y-3">
            {past.length ? past.map(renderCard) : <p className="rounded-2xl border border-dashed border-slate-300 p-6 text-sm text-slate-500">No past viewings.</p>}
          </div>
        </section>
      </>}
    </div>
  );
}
