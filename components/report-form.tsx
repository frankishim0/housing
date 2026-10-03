'use client';

import { FormEvent, useState } from 'react';

const categories = [
  'FRAUD_SCAM',
  'INCORRECT_INFORMATION',
  'DUPLICATE_LISTING',
  'INAPPROPRIATE_CONTENT',
  'FAKE_PROPERTY',
  'SUSPICIOUS_BEHAVIOR',
  'OTHER',
] as const;

export function ReportForm({ defaultTargetType, defaultPropertyId, defaultTargetUserId, defaultMessageId }: { defaultTargetType?: string; defaultPropertyId?: string; defaultTargetUserId?: string; defaultMessageId?: string }) {
  const [targetType, setTargetType] = useState(defaultTargetType ?? 'PROPERTY');
  const [category, setCategory] = useState('FRAUD_SCAM');
  const [propertyId, setPropertyId] = useState(defaultPropertyId ?? '');
  const [targetUserId, setTargetUserId] = useState(defaultTargetUserId ?? '');
  const [messageId, setMessageId] = useState(defaultMessageId ?? '');
  const [reason, setReason] = useState('');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetType,
          category,
          propertyId: propertyId || undefined,
          targetUserId: targetUserId || undefined,
          messageId: messageId || undefined,
          reason,
          details,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to submit report.');
      setFeedback('Report submitted. Our moderation team will review it.');
      setReason('');
      setDetails('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to submit report.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">
          Target type
          <select value={targetType} onChange={(event) => setTargetType(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
            <option value="PROPERTY">Property</option>
            <option value="USER">User</option>
            <option value="AGENT">Agent</option>
            <option value="MESSAGE">Message</option>
          </select>
        </label>
        <label className="text-sm font-medium text-slate-700">
          Category
          <select value={category} onChange={(event) => setCategory(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2">
            {categories.map((item) => <option key={item} value={item}>{item.replace(/_/g, ' ').toLowerCase()}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        <label className="text-sm font-medium text-slate-700">Property ID<input value={propertyId} onChange={(event) => setPropertyId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">Target user ID<input value={targetUserId} onChange={(event) => setTargetUserId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
        <label className="text-sm font-medium text-slate-700">Message ID<input value={messageId} onChange={(event) => setMessageId(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" /></label>
      </div>
      <label className="block text-sm font-medium text-slate-700">
        Reason
        <input value={reason} onChange={(event) => setReason(event.target.value)} className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <label className="block text-sm font-medium text-slate-700">
        Details
        <textarea value={details} onChange={(event) => setDetails(event.target.value)} className="mt-1 min-h-28 w-full rounded-xl border border-slate-200 px-3 py-2" />
      </label>
      <button disabled={busy} className="rounded-full bg-emerald-700 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">
        {busy ? 'Submitting…' : 'Submit report'}
      </button>
      {error && <p className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {feedback && <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{feedback}</p>}
    </form>
  );
}
