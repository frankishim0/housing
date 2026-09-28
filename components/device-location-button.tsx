'use client';

import { MapPin } from 'lucide-react';

export function DeviceLocationButton() {
  function setLocation() {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      const form = document.querySelector<HTMLFormElement>('form[action="/search"]');
      if (!form) return;
      const fields: Record<string, string> = {
        latitude: String(coords.latitude),
        longitude: String(coords.longitude),
        radiusKm: '25',
      };
      for (const [name, value] of Object.entries(fields)) {
        const input = form.elements.namedItem(name);
        if (input instanceof HTMLInputElement) input.value = value;
      }
    }, () => undefined, { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 });
  }

  return <button type="button" onClick={setLocation} className="inline-flex items-center gap-1.5 text-xs font-semibold text-emerald-800 hover:text-emerald-950"><MapPin size={14} /> Use my location</button>;
}
