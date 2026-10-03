'use client';

import { useEffect, useState } from 'react';

type Verification = {
  id: string;
  type: string;
  status: string;
  notes: string | null;
  rejectionReason: string | null;
  createdAt: string;
  documentCount: number;
  property: { id: string; title: string; slug: string; verified: boolean; verifiedAt: string | null } | null;
  user: { id: string; name: string; email: string; role: string; verificationStatus: string };
};

type Report = {
  id: string;
  targetType: string;
  category: string;
  reason: string;
  status: string;
  details: string | null;
  createdAt: string;
  property: { title: string; slug: string } | null;
  reporter: { id: string; name: string; email: string } | null;
  targetUser: { id: string; name: string; email: string; role: string } | null;
};

type PendingProperty = {
  id: string;
  slug: string;
  title: string;
  status: string;
  updatedAt: string;
  owner: { id: string; name: string | null; email: string };
  agent: { id: string; name: string | null; email: string } | null;
};

export function AdminModerationPanel() {
  const [verifications, setVerifications] = useState<Verification[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [pendingProperties, setPendingProperties] = useState<PendingProperty[]>([]);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState('');

  async function reload() {
    const response = await fetch('/api/admin/moderation', { cache: 'no-store' });
    const result = await response.json();
    if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load moderation data.');
    setVerifications(result.data.verifications);
    setReports(result.data.reports);
    setPendingProperties(result.data.pendingProperties ?? []);
  }

  useEffect(() => {
    void reload().catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Unable to load moderation data.'));
  }, []);

  async function reviewVerification(id: string, action: 'approve' | 'reject' | 'request_more_info' | 'suspend') {
    setBusyId(id);
    try {
      const notes = action === 'approve' ? 'Verified after admin review.' : prompt('Add a reason or note') ?? '';
      const response = await fetch(`/api/verifications/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, notes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to review verification.');
      await reload();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Unable to review verification.');
    } finally {
      setBusyId('');
    }
  }

  async function updateReport(id: string, action: 'resolve' | 'dismiss' | 'suspend_user') {
    setBusyId(id);
    try {
      const adminNotes = action === 'dismiss' ? 'Dismissed after moderation review.' : prompt('Add moderation notes') ?? '';
      if (action !== 'dismiss' && !adminNotes.trim()) return;
      const response = await fetch(`/api/admin/reports/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, adminNotes }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to update report.');
      await reload();
    } catch (reportError) {
      setError(reportError instanceof Error ? reportError.message : 'Unable to update report.');
    } finally {
      setBusyId('');
    }
  }

  async function reviewListing(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    try {
      const reason = action === 'reject' ? (prompt('Provide a rejection reason') ?? '').trim() : '';
      if (action === 'reject' && !reason) {
        throw new Error('A rejection reason is required.');
      }
      const response = await fetch(`/api/admin/properties/${encodeURIComponent(id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'reject' ? { status: 'REJECTED', reason } : { status: 'PUBLISHED' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to review listing.');
      await reload();
    } catch (listingError) {
      setError(listingError instanceof Error ? listingError.message : 'Unable to review listing.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="mt-8 grid gap-6">
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Pending listings</h2>
        <div className="mt-4 space-y-3">
          {pendingProperties.length === 0 ? <p className="text-sm text-slate-500">No listings awaiting review.</p> : pendingProperties.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-900">{item.title}</p>
              <p className="mt-1 text-sm text-slate-600">Owner: {item.owner.name ?? item.owner.email}</p>
              {item.agent && <p className="mt-1 text-sm text-slate-600">Assigned agent: {item.agent.name ?? item.agent.email}</p>}
              <p className="mt-1 text-sm text-slate-500">Submitted {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.updatedAt))}</p>
              <a href={`/properties/${item.slug}`} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">Open listing</a>
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busyId === item.id} onClick={() => void reviewListing(item.id, 'approve')} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve & publish</button>
                <button disabled={busyId === item.id} onClick={() => void reviewListing(item.id, 'reject')} className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Reject</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Pending verifications</h2>
        <div className="mt-4 space-y-3">
          {verifications.length === 0 ? <p className="text-sm text-slate-500">No verification requests pending.</p> : verifications.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-900">{item.type.replace(/_/g, ' ').toLowerCase()} · {item.status.toLowerCase()}</p>
              <p className="mt-1 text-sm text-slate-600">{item.user.name} ({item.user.email})</p>
              <p className="mt-1 text-sm text-slate-500">{item.property ? item.property.title : 'User verification'} · submitted {new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(item.createdAt))}</p>
              {item.documentCount > 0 && (
                <div className="mt-2 flex flex-wrap gap-2">
                  {Array.from({ length: item.documentCount }, (_, index) => (
                    <a key={index} href={`/api/verifications/${encodeURIComponent(item.id)}/documents/${index}`} className="text-sm font-semibold text-emerald-800 underline">Open private document {index + 1}</a>
                  ))}
                </div>
              )}
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busyId === item.id} onClick={() => void reviewVerification(item.id, 'approve')} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Approve</button>
                <button disabled={busyId === item.id} onClick={() => void reviewVerification(item.id, 'reject')} className="rounded-full bg-rose-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Reject</button>
                <button disabled={busyId === item.id} onClick={() => void reviewVerification(item.id, 'request_more_info')} className="rounded-full bg-slate-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Request more info</button>
                <button disabled={busyId === item.id} onClick={() => void reviewVerification(item.id, 'suspend')} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60">Suspend user</button>
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-bold text-slate-900">Reports</h2>
        <div className="mt-4 space-y-3">
          {reports.length === 0 ? <p className="text-sm text-slate-500">No reports pending.</p> : reports.map((item) => (
            <article key={item.id} className="rounded-2xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-900">{item.category.replace(/_/g, ' ').toLowerCase()} · {item.targetType}</p>
              <p className="mt-1 text-sm text-slate-600">{item.reason}</p>
              <p className="mt-1 text-xs text-slate-500">{item.reporter?.name ?? 'Unknown'} · {item.status}</p>
              {item.details && <p className="mt-2 text-sm text-slate-600">{item.details}</p>}
              {item.property && <a href={`/properties/${item.property.slug}`} className="mt-2 inline-block text-sm font-semibold text-emerald-800 underline">Open reported listing</a>}
              <div className="mt-3 flex flex-wrap gap-2">
                <button disabled={busyId === item.id} onClick={() => void updateReport(item.id, 'resolve')} className="rounded-full bg-emerald-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">Resolve</button>
                <button disabled={busyId === item.id} onClick={() => void updateReport(item.id, 'dismiss')} className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 disabled:opacity-60">Dismiss</button>
                {item.targetUser && <button disabled={busyId === item.id} onClick={() => void updateReport(item.id, 'suspend_user')} className="rounded-full border border-rose-300 px-4 py-2 text-sm font-semibold text-rose-800 disabled:opacity-60">Suspend reported user</button>}
              </div>
            </article>
          ))}
        </div>
      </div>
      {error && <p className="rounded-2xl bg-rose-50 p-4 text-sm text-rose-700">{error}</p>}
    </section>
  );
}
