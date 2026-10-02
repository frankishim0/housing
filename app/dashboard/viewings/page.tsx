import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ViewingManager } from '@/components/viewing-manager';

export const dynamic = 'force-dynamic';

export default async function ViewingsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <div className="mb-8">
        <Link href="/dashboard" className="text-sm font-semibold text-emerald-800 hover:underline">← Dashboard</Link>
        <h1 className="mt-3 text-3xl font-bold text-slate-900">Property viewings</h1>
        <p className="mt-2 text-sm text-slate-600">Review requests, coordinate another time, and keep track of upcoming and past viewings.</p>
      </div>
      <ViewingManager userId={user.id} isAdmin={user.role === 'ADMIN'} initialNow={new Date().toISOString()} />
    </main>
  );
}
