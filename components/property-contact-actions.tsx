'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FavoriteButton } from '@/components/favorite-button';
import { PropertyLiveExperience } from '@/components/property-live-experience';
import { TransactionQuote } from '@/components/transaction-quote';

function localDateTimeValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function PropertyContactActions({ propertyId, ownerId, agentId, buyers = [], currentUserId }: { propertyId: string; ownerId: string; agentId: string | null; buyers?: { id: string; name: string }[]; currentUserId?: string | null }) {
  const router = useRouter();
  const [mode, setMode] = useState<'enquiry' | 'viewing' | null>(null);
  const [message, setMessage] = useState('');
  const [scheduledAt, setScheduledAt] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);

  async function openChat(recipientId: string) {
    setPending(true);
    setFeedback('');
    try {
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ propertyId, recipientId }),
      });
      const result = await response.json();
      if (response.status === 401) {
        router.push('/auth');
        return;
      }
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to open conversation.');
      router.push(`/messages?conversation=${encodeURIComponent(result.data.id)}`);
    } catch (chatError) {
      setFeedback(chatError instanceof Error ? chatError.message : 'Unable to open conversation.');
      setPending(false);
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFeedback('');
    const endpoint = mode === 'enquiry' ? '/api/enquiries' : '/api/viewings';
    if (mode === 'viewing' && (!scheduledAt || new Date(scheduledAt).getTime() <= Date.now())) {
      setFeedback('Choose a viewing date and time in the future.');
      setPending(false);
      return;
    }
    const body = mode === 'enquiry'
      ? { propertyId, message }
      : {
          propertyId,
          scheduledAt: new Date(scheduledAt).toISOString(),
          preferredDate: scheduledAt.slice(0, 10),
          preferredTime: scheduledAt.slice(11, 16),
          timeZoneOffsetMinutes: new Date(scheduledAt).getTimezoneOffset(),
          message,
        };
    const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    const result = await response.json();
    setPending(false);
    if (!response.ok) {
      setFeedback(typeof result.error === 'string' ? result.error : 'Unable to submit request.');
      return;
    }
    setFeedback(mode === 'enquiry' ? 'Enquiry sent.' : 'Viewing requested.');
    setMessage('');
  }

  return (
    <div className="space-y-3">
      <PropertyLiveExperience propertyId={propertyId} ownerId={ownerId} agentId={agentId} currentUserId={currentUserId} buyers={buyers} />
      {agentId && agentId !== currentUserId && <button type="button" disabled={pending} onClick={() => void openChat(agentId)} className="w-full rounded-full bg-emerald-700 px-5 py-3 font-semibold text-white disabled:opacity-60">{pending ? 'Opening chat…' : 'Chat with Agent'}</button>}
      {ownerId !== currentUserId && <button type="button" disabled={pending} onClick={() => void openChat(ownerId)} className="w-full rounded-full border border-emerald-700 px-5 py-3 font-semibold text-emerald-800 disabled:opacity-60">Contact Owner</button>}
      {buyers.map((buyer) => <button key={buyer.id} type="button" disabled={pending} onClick={() => void openChat(buyer.id)} className="w-full rounded-full border border-sky-200 bg-sky-50 px-5 py-3 font-semibold text-sky-900 disabled:opacity-60">Contact Buyer · {buyer.name}</button>)}
      {currentUserId !== ownerId && currentUserId !== agentId && <TransactionQuote propertyId={propertyId} />}
      <button onClick={() => setMode(mode === 'enquiry' ? null : 'enquiry')} className="w-full rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white">Send enquiry</button>
      {currentUserId !== ownerId && currentUserId !== agentId && <button onClick={() => {
        if (!currentUserId) {
          router.push('/auth');
          return;
        }
        setMode(mode === 'viewing' ? null : 'viewing');
      }} className="w-full rounded-full border border-slate-200 px-5 py-3 font-semibold text-slate-700">Schedule viewing</button>}
      <div className="grid grid-cols-2 gap-3">
        <FavoriteButton propertyId={propertyId} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-medium text-slate-700" />
        <a href={`mailto:?subject=Property enquiry&body=${encodeURIComponent(`I am interested in property ${propertyId}`)}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-medium text-slate-700">Email</a>
      </div>
      {mode && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-slate-50 p-4">
          {mode === 'viewing' && <label className="block text-xs font-semibold text-slate-600">Date and time
            <input required type="datetime-local" value={scheduledAt} onFocus={(event) => {
              event.currentTarget.min = localDateTimeValue(new Date(Date.now() + 60_000));
            }} onChange={(event) => setScheduledAt(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
          </label>}
          <textarea required={mode === 'enquiry'} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={mode === 'enquiry' ? 'Tell the owner what you need...' : 'Add an optional note'} className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
          <button disabled={pending} className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Sending…' : 'Submit request'}</button>
          {feedback && <p className="text-sm text-slate-600">{feedback}</p>}
        </form>
      )}
    </div>
  );
}
