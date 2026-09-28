'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

type Result = {
  id: string;
  label: string;
  latitude: number;
  longitude: number;
  countryCode: string | null;
  country?: string;
  region?: string;
  city?: string;
  neighborhood?: string;
  postalCode?: string;
};
const LocationPinMap = dynamic(() => import('@/components/location-pin-map').then((module) => module.LocationPinMap), {
  ssr: false,
  loading: () => <div className="h-56 animate-pulse rounded-lg bg-slate-100" />,
});

export function PropertyLocationPicker({ onSelect }: { onSelect: (result: Result) => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Result[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [pin, setPin] = useState<{ latitude: number; longitude: number } | null>(null);

  function updatePin(coordinates: { latitude: number; longitude: number }) {
    setPin(coordinates);
    onSelect({
      id: 'manual-pin',
      label: query.trim() || `${coordinates.latitude.toFixed(6)}, ${coordinates.longitude.toFixed(6)}`,
      ...coordinates,
      countryCode: null,
    });
  }

  async function search() {
    if (query.trim().length < 2) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch(`/api/maps/geocode?q=${encodeURIComponent(query.trim())}`);
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : 'Location search failed.');
      setResults(result.data as Result[]);
    } catch (searchError) {
      setError(searchError instanceof Error ? searchError.message : 'Location search failed.');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-2 rounded-xl border border-slate-200 p-3 md:col-span-2">
      <label className="block text-sm font-medium text-slate-700" htmlFor="property-location-search">Find and pin this property using OpenStreetMap</label>
      <div className="flex gap-2">
        <input id="property-location-search" value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); void search(); } }} placeholder="Search address, city, or landmark" className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm" />
        <button type="button" onClick={() => void search()} disabled={loading} className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60">{loading ? 'Searching…' : 'Find'}</button>
      </div>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      {results.length > 0 && (
        <ul className="max-h-48 divide-y overflow-auto rounded-lg border border-slate-200">
          {results.map((result) => (
            <li key={result.id}>
              <button type="button" onClick={() => { setQuery(result.label); setPin({ latitude: result.latitude, longitude: result.longitude }); onSelect(result); setResults([]); }} className="w-full px-3 py-2 text-left text-sm hover:bg-emerald-50">{result.label}</button>
            </li>
          ))}
        </ul>
      )}
      {pin && <div className="space-y-1"><p className="text-xs text-slate-600">Drag the pin or click the map to set the exact property location.</p><LocationPinMap coordinates={pin} onChange={updatePin} /></div>}
      <p className="text-xs text-slate-500">Search results use OpenStreetMap data. © OpenStreetMap contributors.</p>
    </div>
  );
}
