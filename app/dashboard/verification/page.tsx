import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { VerificationRequestForm } from '@/components/verification-request-form';

export const dynamic = 'force-dynamic';

export default async function VerificationPage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/auth');
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: { region: true, city: true },
  });
  if (!user) redirect('/auth');

  const verifications = await prisma.verification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 5,
    include: { property: { select: { id: true, title: true, slug: true, verified: true, verifiedAt: true } } },
  });

  return (
    <main className="mx-auto max-w-4xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Trust & verification</p>
          <h1 className="mt-1 text-3xl font-bold">Verification requests</h1>
        </div>
        <Link href="/dashboard" className="text-sm font-semibold text-slate-600 hover:text-emerald-800">Dashboard</Link>
      </div>
      <section className="rounded-2xl border border-slate-200 bg-white p-6">
        <VerificationRequestForm />
      </section>
      <section className="mt-8 rounded-2xl border border-slate-200 bg-white p-6">
        <h2 className="text-xl font-bold text-slate-900">Recent requests</h2>
        <div className="mt-4 space-y-3">
          {verifications.length === 0 ? <p className="text-sm text-slate-500">No verification requests yet.</p> : verifications.map((item) => (
            <article key={item.id} className="rounded-xl border border-slate-100 p-4">
              <p className="font-semibold text-slate-900">{item.type.replace(/_/g, ' ').toLowerCase()} · {item.status.toLowerCase()}</p>
              <p className="mt-1 text-sm text-slate-600">{item.property ? <Link href={`/properties/${item.property.slug}`} className="text-emerald-800 underline">{item.property.title}</Link> : 'User verification'} · submitted {new Intl.DateTimeFormat(user.preferredLanguage, { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timeZone ?? undefined }).format(item.createdAt)}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
