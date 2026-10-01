'use client';

import { useCallback, useEffect, useState } from 'react';
import { formatCurrency } from '@/lib/international';

type Payout = {
  id: string;
  status: string;
  amount: string;
  currencyCode: string;
  attempts: number;
  failureReason: string | null;
  requestedAt: string;
  completedAt: string | null;
  transferCode: string | null;
  approvedAt: string | null;
  approvedBy: { id: string; name: string; email: string } | null;
  transaction: { id: string; reference: string; status: string; payoutDueAt: string | null; property: { title: string } | null } | null;
  recipient: { id: string; name: string; email: string };
  payoutAccount: { bankName: string; accountNumberLast4: string; status: string } | null;
};

type StatusCount = { status: string; currencyCode: string; _sum: { amount: string | null }; _count: { _all: number } };

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';

export function AdminPayoutsPanel() {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [statusCounts, setStatusCounts] = useState<StatusCount[]>([]);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [busyId, setBusyId] = useState('');
  const [schedulerBusy, setSchedulerBusy] = useState(false);
  const [feedback, setFeedback] = useState('');
  const [error, setError] = useState('');

  const reload = useCallback(async () => {
    setError('');
    try {
      const response = await fetch(`/api/admin/payouts${statusFilter ? `?status=${statusFilter}` : ''}`);
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load payouts.');
      setPayouts(result.data);
      setStatusCounts(result.statusCounts);
      setPayoutsEnabled(result.payoutsEnabled);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Unable to load payouts.');
    }
  }, [statusFilter]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/admin/payouts${statusFilter ? `?status=${statusFilter}` : ''}`, { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to load payouts.');
        setPayouts(result.data);
        setStatusCounts(result.statusCounts);
        setPayoutsEnabled(result.payoutsEnabled);
      })
      .catch((loadError: unknown) => {
        if (controller.signal.aborted) return;
        setError(loadError instanceof Error ? loadError.message : 'Unable to load payouts.');
      });
    return () => controller.abort();
  }, [statusFilter]);

  async function runScheduler() {
    setSchedulerBusy(true);
    setFeedback('');
    setError('');
    try {
      const response = await fetch('/api/admin/payouts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run_scheduler' }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Scheduler run failed.');
      setFeedback(`Eligibility scan processed ${result.data.eligibilityScan.processed ?? 0} transaction(s). Transfers are never initiated automatically.`);
      await reload();
    } catch (schedulerError) {
      setError(schedulerError instanceof Error ? schedulerError.message : 'Scheduler run failed.');
    } finally {
      setSchedulerBusy(false);
    }
  }

  async function act(id: string, action: 'approve' | 'initiate' | 'retry' | 'reconcile' | 'hold' | 'release') {
    setBusyId(id);
    setFeedback('');
    setError('');
    try {
      const body = action === 'hold' || action === 'release' || action === 'approve'
        ? { action, reason: action === 'approve'
          ? 'Administrator reviewed the eligible transaction and approved this seller payout.'
          : `Administrator ${action === 'hold' ? 'placed a hold on' : 'released'} this payout.` }
        : { action };
      const response = await fetch(`/api/admin/payouts/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Payout action failed.');
      setFeedback(`Payout ${id}: ${JSON.stringify(result.data)}`);
      await reload();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : 'Payout action failed.');
    } finally {
      setBusyId('');
    }
  }

  return (
    <section className="mt-10 rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Seller/agent payouts (test mode)</h2>
          <p className="mt-1 text-sm text-slate-600">
            Feature flag: <span className={`font-semibold ${payoutsEnabled ? 'text-emerald-700' : 'text-red-700'}`}>{payoutsEnabled ? 'ENABLED' : 'DISABLED'}</span>.
            {!payoutsEnabled && ' Set PAYOUTS_ENABLED=true and configure Paystack test-mode transfer credentials to enable payout creation and transfers.'}
          </p>
        </div>
        <button type="button" onClick={() => void runScheduler()} disabled={schedulerBusy || !payoutsEnabled} className="rounded-full bg-indigo-700 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50">
          {schedulerBusy ? 'Running…' : 'Scan for eligible payouts'}
        </button>
      </div>
      {feedback && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{feedback}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-900">{error}</p>}

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        {statusCounts.map((entry) => (
          <span key={`${entry.status}-${entry.currencyCode}`} className="rounded-full bg-slate-100 px-3 py-1 font-medium text-slate-700">
            {entry.status} · {entry.currencyCode}: {entry._count._all} ({formatCurrency(Number(entry._sum.amount ?? 0), entry.currencyCode)})
          </span>
        ))}
      </div>

      <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className={`${fieldClass} mt-4 max-w-xs`}>
        <option value="">All statuses</option>
        {['NOT_DUE', 'PENDING', 'PROCESSING', 'PAID', 'FAILED', 'HELD'].map((status) => <option key={status} value={status}>{status}</option>)}
      </select>

      <div className="mt-4 space-y-3">
        {payouts.length === 0 && <p className="text-sm text-slate-500">No payouts match this filter.</p>}
        {payouts.map((payout) => (
          <article key={payout.id} className="rounded-2xl border border-slate-200 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="font-semibold text-slate-900">{payout.transaction?.property?.title ?? 'Property unavailable'} · {payout.transaction?.reference}</p>
                <p className="mt-1 text-xs text-slate-500">Recipient {payout.recipient.name} ({payout.recipient.email}) · {payout.payoutAccount ? `${payout.payoutAccount.bankName} ••••${payout.payoutAccount.accountNumberLast4} (${payout.payoutAccount.status})` : 'No verified bank account'}</p>
                <p className="mt-1 text-xs text-slate-500">
                  {payout.approvedAt
                    ? `Approved ${new Date(payout.approvedAt).toLocaleString()}${payout.approvedBy ? ` by ${payout.approvedBy.name}` : ''}`
                    : 'Awaiting admin approval'}
                  {payout.transaction?.payoutDueAt && ` · Eligible after ${new Date(payout.transaction.payoutDueAt).toLocaleString()}`}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900">{formatCurrency(Number(payout.amount), payout.currencyCode)}</p>
                <p className="text-xs text-slate-500">{payout.status} · attempts {payout.attempts}</p>
              </div>
            </div>
            {payout.failureReason && <p className="mt-2 text-xs text-red-700">Failure: {payout.failureReason}</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              {payout.status === 'PENDING' && !payout.approvedAt && <button type="button" disabled={busyId === payout.id || !payoutsEnabled} onClick={() => void act(payout.id, 'approve')} className="rounded-full border border-indigo-300 px-3 py-1 text-xs font-semibold text-indigo-800 disabled:opacity-50">Approve</button>}
              <button type="button" disabled={busyId === payout.id || !payoutsEnabled || !payout.approvedAt} onClick={() => void act(payout.id, 'initiate')} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">Initiate transfer</button>
              <button type="button" disabled={busyId === payout.id || !payoutsEnabled || payout.status !== 'FAILED'} onClick={() => void act(payout.id, 'retry')} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">Reset for reviewed retry</button>
              <button type="button" disabled={busyId === payout.id || !payoutsEnabled} onClick={() => void act(payout.id, 'reconcile')} className="rounded-full border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 disabled:opacity-50">Reconcile</button>
              <button type="button" disabled={busyId === payout.id || !payoutsEnabled} onClick={() => void act(payout.id, 'hold')} className="rounded-full border border-amber-300 px-3 py-1 text-xs font-semibold text-amber-800 disabled:opacity-50">Hold</button>
              <button type="button" disabled={busyId === payout.id || !payoutsEnabled} onClick={() => void act(payout.id, 'release')} className="rounded-full border border-emerald-300 px-3 py-1 text-xs font-semibold text-emerald-800 disabled:opacity-50">Release</button>
            </div>
          </article>
        ))}
      </div>
      <p className="mt-4 text-xs text-slate-500">All transfers use Paystack test-mode credentials only. No live transfers or real money movement occur, even when this feature is enabled.</p>
    </section>
  );
}
