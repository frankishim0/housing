import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PropertyCard } from '@/components/property-card';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';

export const dynamic = 'force-dynamic';

export default async function FavoritesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: { property: { include: { location: true, media: true, amenities: true, owner: true, agent: true } } },
    orderBy: { createdAt: 'desc' },
  });

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div><p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Saved</p><h1 className="mt-2 text-4xl font-bold text-slate-900">Saved properties</h1></div>
        <Link href="/search" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white">Explore homes</Link>
      </div>
      {favorites.length ? (
        <div className="grid gap-6 lg:grid-cols-3">{favorites.map(({ property }) => <PropertyCard key={property.id} property={presentProperty(property, true)} />)}</div>
      ) : (
        <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-slate-600">You have not saved any properties yet.</div>
      )}
    </main>
  );
}
