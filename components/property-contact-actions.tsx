'use client';

import { FormEvent, useState } from 'react';
import { FavoriteButton } from '@/components/favorite-button';

export function PropertyContactActions({ propertyId }: { propertyId: string }) {
  const [mode, setMode] = useState<'enquiry' | 'viewing' | null>(null);
  const [message, setMessage] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setPending(true);
    setFeedback('');
    const endpoint = mode === 'enquiry' ? '/api/enquiries' : '/api/viewings';
    const body = mode === 'enquiry'
      ? { propertyId, message }
      : { propertyId, preferredDate: date, preferredTime: time, message };
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
      <button onClick={() => setMode(mode === 'enquiry' ? null : 'enquiry')} className="w-full rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white">Send enquiry</button>
      <button onClick={() => setMode(mode === 'viewing' ? null : 'viewing')} className="w-full rounded-full border border-slate-200 px-5 py-3 font-semibold text-slate-700">Schedule viewing</button>
      <div className="grid grid-cols-2 gap-3">
        <FavoriteButton propertyId={propertyId} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-medium text-slate-700" />
        <a href={`mailto:?subject=Property enquiry&body=${encodeURIComponent(`I am interested in property ${propertyId}`)}`} className="rounded-2xl border border-slate-200 bg-slate-50 px-3 py-3 text-center text-sm font-medium text-slate-700">Email</a>
      </div>
      {mode && (
        <form onSubmit={submit} className="space-y-3 rounded-2xl bg-slate-50 p-4">
          {mode === 'viewing' && <><input required type="date" value={date} onChange={(event) => setDate(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" /><input required type="time" value={time} onChange={(event) => setTime(event.target.value)} className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2" /></>}
          <textarea required={mode === 'enquiry'} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={mode === 'enquiry' ? 'Tell the owner what you need...' : 'Add a note (optional)'} className="min-h-24 w-full rounded-xl border border-slate-200 bg-white px-3 py-2" />
          <button disabled={pending} className="w-full rounded-full bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Sending…' : 'Submit request'}</button>
          {feedback && <p className="text-sm text-slate-600">{feedback}</p>}
        </form>
      )}
    </div>
  );
}
