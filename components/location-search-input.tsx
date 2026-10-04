'use client';

import { useRef, useState } from 'react';

type Result = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  city?: string;
};

export function LocationSearchInput({ defaultValue = '', defaultLatitude = '', defaultLongitude = '', className, onCountryChange }: { defaultValue?: string; defaultLatitude?: string; defaultLongitude?: string; className: string; onCountryChange?: (countryCode: string) => void }) {
  const [value, setValue] = useState(defaultValue);
  const [results, setResults] = useState<Result[]>([]);
  const latitudeRef = useRef<HTMLInputElement>(null);
  const longitudeRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function search() {
    if (value.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/maps/geocode?q=${encodeURIComponent(value.trim())}`);
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Location search failed.');
      setResults(result.data as Result[]);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Location search failed.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative sm:col-span-2">
      <div className="flex gap-2">
        <input name="location" value={value} onChange={(event) => {
          setValue(event.target.value);
          if (latitudeRef.current) latitudeRef.current.value = '';
          if (longitudeRef.current) longitudeRef.current.value = '';
        }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} placeholder="London, Maitama, 10001…" className={className} />
        <button type="button" onClick={() => void search()} disabled={loading} className="shrink-0 rounded-md border border-slate-300 px-3 text-xs font-semibold text-slate-700 disabled:opacity-50">{loading ? '…' : 'Places'}</button>
      </div>
      <input ref={latitudeRef} type="hidden" name="latitude" defaultValue={defaultLatitude} />
      <input ref={longitudeRef} type="hidden" name="longitude" defaultValue={defaultLongitude} />
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
      {results.length > 0 && <ul className="absolute z-20 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-slate-200 bg-white shadow-lg">
        {results.map((place) => <li key={place.id}><button type="button" onClick={() => {
          setValue(place.label);
          if (latitudeRef.current) latitudeRef.current.value = String(place.latitude);
          if (longitudeRef.current) longitudeRef.current.value = String(place.longitude);
          const form = latitudeRef.current?.form;
          if (place.countryCode) {
            if (onCountryChange) {
              onCountryChange(place.countryCode);
            } else {
              const country = form?.elements.namedItem('countryCode');
              if (country instanceof HTMLSelectElement) country.value = place.countryCode;
            }
          }
          const city = form?.elements.namedItem('city');
          if (place.city && city instanceof HTMLInputElement) city.value = place.city;
          setResults([]);
        }} className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50">{place.label}</button></li>)}
      </ul>}
      <p className="mt-1 text-xs text-slate-500">Location search by OpenStreetMap contributors.</p>
    </div>
  );
}
