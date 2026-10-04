'use client';

import { useMemo, useRef, useState } from 'react';
import { countries } from '@/lib/international';

export function SearchableCountrySelect({
  name = 'countryCode',
  value,
  onChange,
  className = '',
}: {
  name?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  const selected = countries.find((country) => country.code === value);
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const matches = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return countries;
    return countries.filter((country) => country.name.toLowerCase().includes(term) || country.code.toLowerCase() === term);
  }, [query]);

  function choose(code: string) {
    onChange(code);
    setQuery('');
    setOpen(false);
  }

  return (
    <div className="relative">
      <input type="hidden" name={name} value={value} />
      <input
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls="country-options"
        aria-autocomplete="list"
        autoComplete="off"
        placeholder="Search for a country"
        value={open ? query : selected?.name ?? ''}
        className={className}
        onFocus={() => { setQuery(''); setActive(0); setOpen(true); }}
        onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 120); }}
        onChange={(event) => { setQuery(event.target.value); setActive(0); setOpen(true); if (!event.target.value && value) onChange(''); }}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') { event.preventDefault(); setOpen(true); setActive((index) => Math.min(index + 1, matches.length - 1)); }
          else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((index) => Math.max(index - 1, 0)); }
          else if (event.key === 'Enter' && open && matches[active]) { event.preventDefault(); choose(matches[active].code); }
          else if (event.key === 'Escape') setOpen(false);
        }}
      />
      {open && (
        <ul id="country-options" role="listbox" className="absolute z-20 mt-1 max-h-60 w-full overflow-auto rounded-2xl border border-slate-200 bg-white py-1 shadow-lg">
          {matches.length === 0 && <li className="px-4 py-2 text-sm text-slate-500">No countries found</li>}
          {matches.map((country, index) => (
            <li
              key={country.code}
              role="option"
              aria-selected={country.code === value}
              onMouseDown={(event) => { event.preventDefault(); if (blurTimer.current) clearTimeout(blurTimer.current); choose(country.code); }}
              className={`cursor-pointer px-4 py-2 text-sm ${index === active ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'}`}
            >
              {country.name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
