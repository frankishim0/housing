'use client';

import { FormEvent, useState } from 'react';
import { CountrySelect } from '@/components/country-select';
import { CurrencySelect } from '@/components/currency-select';
import { useSetCurrencyPreference } from '@/components/currency-preference';
import { getCountryCurrency } from '@/lib/international';

const inputClass = 'w-full rounded-md border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-emerald-700';

export function ProfileSettingsForm({ defaults }: { defaults: { name: string; profileImage: string; phone: string; countryCode: string; region: string; city: string; preferredCurrency: string; preferredLanguage: string; timeZone: string; measurementUnit: string; verificationStatus: string } }) {
  const setDisplayCurrency = useSetCurrencyPreference();
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [pending, setPending] = useState(false);
  const [countryCode, setCountryCode] = useState(defaults.countryCode);
  const [preferredCurrency, setPreferredCurrency] = useState(defaults.preferredCurrency);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError('');
    setSaved(false);
    const values = Object.fromEntries(new FormData(event.currentTarget));
    const response = await fetch('/api/auth/me', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(values),
    });
    const result = await response.json().catch(() => ({}));
    setPending(false);
    if (!response.ok) {
      setError(typeof result.error === 'string' ? result.error : 'Profile could not be updated.');
      return;
    }
    if (result.user?.preferredCurrency) setDisplayCurrency?.(result.user.preferredCurrency);
    setSaved(true);
  }

  return (
    <form onSubmit={save} className="space-y-6">
      <section className="grid gap-4 sm:grid-cols-2">
        <label className="text-sm font-medium text-slate-700">Name<input name="name" required minLength={2} maxLength={100} defaultValue={defaults.name} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Profile photo URL<input name="profileImage" type="url" defaultValue={defaults.profileImage} placeholder="https://…" className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Phone with country code<input name="phone" type="tel" autoComplete="tel" placeholder="+1 555 010 1234" defaultValue={defaults.phone} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Country<CountrySelect value={countryCode} onChange={(value) => {
          setCountryCode(value);
          if (value) setPreferredCurrency(getCountryCurrency(value));
        }} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Region / province<input name="region" defaultValue={defaults.region} autoComplete="address-level1" className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">City<input name="city" defaultValue={defaults.city} autoComplete="address-level2" className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Preferred display currency<CurrencySelect value={preferredCurrency} onChange={setPreferredCurrency} className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Preferred language<select name="preferredLanguage" defaultValue={defaults.preferredLanguage} className={`${inputClass} mt-1.5`}><option value="en">English</option></select></label>
        <label className="text-sm font-medium text-slate-700">Time zone<input name="timeZone" defaultValue={defaults.timeZone} placeholder="Europe/London" className={`${inputClass} mt-1.5`} /></label>
        <label className="text-sm font-medium text-slate-700">Measurement units<select name="measurementUnit" defaultValue={defaults.measurementUnit} className={`${inputClass} mt-1.5`}><option value="SQUARE_METERS">Square meters (m²)</option><option value="SQUARE_FEET">Square feet (ft²)</option><option value="ACRES">Acres</option><option value="HECTARES">Hectares</option></select></label>
      </section>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
        <p className="text-sm text-slate-600">Verification: <span className="font-semibold">{defaults.verificationStatus.toLowerCase().replace('_', ' ')}</span></p>
        <button type="submit" disabled={pending} className="rounded-md bg-emerald-800 px-5 py-2.5 text-sm font-semibold text-white disabled:opacity-60">{pending ? 'Saving…' : 'Save profile'}</button>
      </div>
      {error && <p role="alert" className="rounded-md bg-rose-50 p-3 text-sm text-rose-700">{error}</p>}
      {saved && <p role="status" className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-800">Profile saved.</p>}
    </form>
  );
}
