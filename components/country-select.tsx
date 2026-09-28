'use client';

import { countries } from '@/lib/international';

export function CountrySelect({
  name = 'countryCode',
  defaultValue = '',
  required = false,
  className = '',
  value,
  onChange,
}: {
  name?: string;
  defaultValue?: string;
  required?: boolean;
  className?: string;
  value?: string;
  onChange?: (value: string) => void;
}) {
  return (
    <select
      name={name}
      {...(value === undefined ? { defaultValue } : { value })}
      onChange={onChange ? (event) => onChange(event.target.value) : undefined}
      required={required}
      className={className}
    >
      <option value="">Select a country</option>
      {countries.map((country) => <option key={country.code} value={country.code}>{country.name}</option>)}
    </select>
  );
}
