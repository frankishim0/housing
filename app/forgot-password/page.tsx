'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage('');
    setError('');
    const response = await fetch('/api/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(Object.fromEntries(new FormData(event.currentTarget))),
    });
    const result = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Unable to send the reset email.');
      return;
    }
    setMessage(result.message);
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Forgot your password?</h1>
        <p className="mt-3 text-slate-600">Enter your account email and we’ll send you a secure reset link.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-2 block">Email</span>
            <input name="email" type="email" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500" />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          {message && <p className="rounded-xl bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{message}</p>}
          <button disabled={pending} type="submit" className="w-full rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
            {pending ? 'Sending…' : 'Send reset link'}
          </button>
        </form>
        <Link href="/auth" className="mt-6 block text-center text-sm text-emerald-700">Back to sign in</Link>
      </div>
    </main>
  );
}
