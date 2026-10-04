'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';
import { SearchableCountrySelect } from '@/components/searchable-country-select';
import { withCallingCode } from '@/lib/phone-country';
import { CurrencySelect } from '@/components/currency-select';
import { getCountryCurrency } from '@/lib/international';
import { useSetCurrencyPreference } from '@/components/currency-preference';

export default function AuthPage() {
  const router = useRouter();
  const setDisplayCurrency = useSetCurrencyPreference();
  const [register, setRegister] = useState(false);
  const [countryCode, setCountryCode] = useState('');
  const [phone, setPhone] = useState('');
  const [preferredCurrency, setPreferredCurrency] = useState('USD');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setPending(true);
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch(register ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await response.json();
    setPending(false);
    if (!response.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Unable to authenticate.');
      return;
    }
    if (result.user.preferredCurrency) setDisplayCurrency?.(result.user.preferredCurrency);
    router.push(['OWNER', 'LANDLORD', 'AGENT', 'PROPERTY_MANAGER', 'DEVELOPER'].includes(result.user.role) ? '/dashboard' : '/search');
    router.refresh();
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-6xl items-center justify-center px-4 py-12">
      <div className="grid w-full overflow-hidden rounded-[32px] border border-slate-200 bg-white shadow-xl shadow-slate-200/60 lg:grid-cols-2">
        <div className="hidden bg-[radial-gradient(circle_at_top,_rgba(16,185,129,0.18),_transparent_40%),linear-gradient(180deg,_#0f172a_0%,_#111827_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-400">Secure access</p>
            <h1 className="mt-4 text-4xl font-bold">Welcome to property discovery without borders.</h1>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/5 p-5 backdrop-blur-sm">
            <p className="text-emerald-200">Trusted by home seekers and property professionals.</p>
          </div>
        </div>

        <div className="p-8 sm:p-12">
          <div className="mb-8">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Access</p>
            <h2 className="mt-2 text-3xl font-bold text-slate-900">{register ? 'Create your account' : 'Sign in to your account'}</h2>
          </div>

          <form className="space-y-5" onSubmit={submit}>
            {register && (
              <>
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-2 block">Name</span>
                  <input name="name" required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500" />
                </label>
                <label className="block text-sm font-medium text-slate-700">
                  <span className="mb-2 block">Account type</span>
                  <select name="role" defaultValue="USER" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3">
                    <option value="USER">Buyer</option>
                    <option value="TENANT">Tenant</option>
                    <option value="OWNER">Property owner</option>
                    <option value="LANDLORD">Landlord</option>
                    <option value="AGENT">Real estate agent</option>
                    <option value="PROPERTY_MANAGER">Property manager</option>
                    <option value="DEVELOPER">Developer</option>
                  </select>
                </label>
                <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Country</span>                <SearchableCountrySelect value={countryCode} onChange={(value) => {
                                  setPhone((current) => withCallingCode(current, countryCode, value));
                                  setCountryCode(value);
                                  setPreferredCurrency(value ? getCountryCurrency(value) : 'USD');
                                }} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Region</span><input name="region" autoComplete="address-level1" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
                  <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">City</span><input name="city" autoComplete="address-level2" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
                </div>
                <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Preferred display currency</span><CurrencySelect value={preferredCurrency} onChange={setPreferredCurrency} className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3" /></label>
              </>
            )}
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-2 block">Email</span>
              <input name="email" type="email" required autoComplete="email" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500" />
            </label>
            {register && <label className="block text-sm font-medium text-slate-700"><span className="mb-2 block">Phone with country code</span><input name="phone" type="tel" autoComplete="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+1 555 010 1234" className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500" /></label>}
            <label className="block text-sm font-medium text-slate-700">
              <span className="mb-2 block">Password</span>
              <input name="password" type="password" minLength={8} required className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 outline-none focus:border-emerald-500" />
            </label>
            {error && <p className="rounded-xl bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            <button disabled={pending} type="submit" className="w-full rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white disabled:opacity-60">
              {pending ? 'Please wait…' : register ? 'Create account' : 'Sign in'}
            </button>
          </form>

          <button onClick={() => setRegister(!register)} className="mt-6 w-full text-center text-sm text-emerald-700">
            {register ? 'Already have an account? Sign in' : 'New here? Create an account'}
          </button>
          {!register && (
            <a href="/forgot-password" className="mt-3 block text-center text-sm text-slate-500 hover:text-emerald-700">
              Forgot your password?
            </a>
          )}
        </div>
      </div>
    </main>
  );
}
