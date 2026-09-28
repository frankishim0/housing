'use client';

import { FormEvent, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-12">Loading password reset…</main>}>
      <ResetPasswordForm />
    </Suspense>
  );
}

function ResetPasswordForm() {
  const router = useRouter();
  const token = useSearchParams().get('token') ?? '';
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password: data.password }),
    });
    const result = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Unable to reset your password.');
      return;
    }
    router.push('/auth?reset=success');
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-xl items-center justify-center px-4 py-12">
      <div className="w-full rounded-[32px] border border-slate-200 bg-white p-8 shadow-xl shadow-slate-200/60 sm:p-12">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Account recovery</p>
        <h1 className="mt-2 text-3xl font-bold text-slate-900">Set a new password</h1>
        <p className="mt-3 text-slate-600">Choose a new password with at least 8 characters.</p>
        <form className="mt-8 space-y-5" onSubmit={submit}>
          <label className="block text-sm font-medium text-slate-700">
            <span className="mb-2 block">New password</span>
            <input name="password" type="password" minLength={8} maxLength={128} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500" />
          </label>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button disabled={pending || !token} type="submit" className="w-full rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
            {pending ? 'Updating…' : 'Update password'}
          </button>
        </form>
        <Link href="/auth" className="mt-6 block text-center text-sm text-emerald-700">Back to sign in</Link>
      </div>
    </main>
  );
}
