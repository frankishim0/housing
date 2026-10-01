'use client';

import { useEffect, useState } from 'react';

type Account = {
  id: string;
  bankName: string;
  maskedAccountNumber: string;
  accountName: string;
  currencyCode: string;
  countryCode: string;
  status: string;
  verifiedAt: string | null;
};

const fieldClass = 'w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm';

export function PayoutAccountForm() {
  const [account, setAccount] = useState<Account | null>(null);
  const [payoutsEnabled, setPayoutsEnabled] = useState(false);
  const [countryCode, setCountryCode] = useState('NG');
  const [currencyCode, setCurrencyCode] = useState('NGN');
  const [bankCode, setBankCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/payouts/bank-account', { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json();
        if (response.ok) {
          setAccount(result.data);
          setPayoutsEnabled(result.payoutsEnabled);
        }
      })
      .catch(() => { /* ignore load errors on initial mount */ });
    return () => controller.abort();
  }, []);

  async function submit() {
    setPending(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch('/api/payouts/bank-account', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ countryCode, currencyCode, bankCode, bankName, accountNumber }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to verify this bank account right now.');
      setAccount(result.data);
      setFeedback('Bank account verified and linked for test-mode payouts.');
      setAccountNumber('');
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : 'Unable to verify this bank account right now.');
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    setPending(true);
    setError('');
    setFeedback('');
    try {
      const response = await fetch('/api/payouts/bank-account', { method: 'DELETE' });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Unable to remove this bank account.');
      setAccount(null);
      setFeedback('Payout bank account disabled.');
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : 'Unable to remove this bank account.');
    } finally {
      setPending(false);
    }
  }

  return (
    <section className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="text-2xl font-bold text-slate-900">Payout bank account (test mode)</h2>
      <p className="mt-2 text-sm text-slate-600">
        Add the bank account that should receive your seller/agent payouts. This is used only to test the payout flow with Paystack test-mode transfers — no real money moves.
      </p>
      {!payoutsEnabled && <p className="mt-3 rounded-xl bg-amber-50 p-3 text-xs text-amber-900">Seller payouts are currently disabled by the platform. You can still onboard a bank account, but transfers will not run until an administrator enables this test-mode feature.</p>}
      {feedback && <p className="mt-3 rounded-xl bg-emerald-50 p-3 text-xs text-emerald-900">{feedback}</p>}
      {error && <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-xs text-red-900">{error}</p>}

      {account && account.status !== 'DISABLED' ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
          <p className="font-semibold">{account.bankName} · {account.maskedAccountNumber}</p>
          <p className="mt-1">{account.accountName} · {account.currencyCode} · {account.status}</p>
          <button type="button" onClick={() => void remove()} disabled={pending} className="mt-3 rounded-full border border-emerald-700 px-4 py-2 text-xs font-semibold text-emerald-900 disabled:opacity-50">
            {pending ? 'Removing…' : 'Remove bank account'}
          </button>
        </div>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs font-semibold text-slate-600">Country code
              <input value={countryCode} onChange={(event) => setCountryCode(event.target.value.toUpperCase())} maxLength={2} className={fieldClass} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Currency code
              <input value={currencyCode} onChange={(event) => setCurrencyCode(event.target.value.toUpperCase())} maxLength={3} className={fieldClass} />
            </label>
            <label className="text-xs font-semibold text-slate-600">Bank code (Paystack)
              <input value={bankCode} onChange={(event) => setBankCode(event.target.value)} className={fieldClass} placeholder="e.g. 058" />
            </label>
            <label className="text-xs font-semibold text-slate-600">Bank name
              <input value={bankName} onChange={(event) => setBankName(event.target.value)} className={fieldClass} placeholder="e.g. Guaranty Trust Bank" />
            </label>
          </div>
          <label className="block text-xs font-semibold text-slate-600">Account number
            <input value={accountNumber} onChange={(event) => setAccountNumber(event.target.value)} className={fieldClass} inputMode="numeric" />
          </label>
          <button type="button" onClick={() => void submit()} disabled={pending || !bankCode || !bankName || !accountNumber} className="w-full rounded-full bg-indigo-700 px-4 py-3 text-sm font-semibold text-white disabled:opacity-50">
            {pending ? 'Verifying…' : 'Verify and link bank account'}
          </button>
          <p className="text-xs text-slate-500">The account name is resolved and confirmed directly with Paystack (test mode) before it is stored. Your full account number is encrypted at rest; only the last 4 digits are ever shown.</p>
        </div>
      )}
    </section>
  );
}
