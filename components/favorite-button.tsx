'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { useRouter } from 'next/navigation';

export function FavoriteButton({ propertyId, initialFavorite = false, className }: { propertyId: string; initialFavorite?: boolean; className?: string }) {
  const router = useRouter();
  const [favorite, setFavorite] = useState(initialFavorite);
  const [pending, setPending] = useState(false);

  async function toggle() {
    setPending(true);
    const response = await fetch(`/api/properties/${propertyId}/favorite`, { method: 'POST' });
    if (response.status === 401) {
      router.push('/auth');
      return;
    }
    if (response.ok) {
      const result = await response.json();
      setFavorite(result.favorite);
    }
    setPending(false);
  }

  return (
    <button aria-label={favorite ? 'Remove from favorites' : 'Save property'} disabled={pending} onClick={toggle} className={className ?? 'absolute right-4 top-4 rounded-full bg-white/90 p-2 text-slate-700 shadow-sm disabled:opacity-60'}>
      <Heart size={16} fill={favorite ? 'currentColor' : 'none'} className={favorite ? 'text-rose-500' : ''} />
    </button>
  );
}
