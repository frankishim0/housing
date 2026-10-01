import { redirect } from 'next/navigation';
import { UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { AdminMonetizationPanel } from '@/components/admin-monetization-panel';
import { AdminPayoutsPanel } from '@/components/admin-payouts-panel';

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  if (user.role !== UserRole.ADMIN) redirect('/dashboard');

  const [users, pendingProperties, reports, payments] = await prisma.$transaction([
    prisma.user.count(),
    prisma.property.count({ where: { status: 'PENDING_REVIEW' } }),
    prisma.report.count({ where: { status: 'OPEN' } }),
    prisma.payment.count(),
  ]);

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Admin</p>
      <h1 className="mt-2 text-4xl font-bold text-slate-900">Platform operations</h1>
      <div className="mt-8 grid gap-5 md:grid-cols-4">
        {[
          ['Users', users],
          ['Pending listings', pendingProperties],
          ['Open reports', reports],
          ['Legacy payments', payments],
        ].map(([label, value]) => <div key={label} className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm"><p className="text-3xl font-bold text-slate-900">{value}</p><p className="mt-1 text-sm text-slate-500">{label}</p></div>)}
      </div>
      <AdminMonetizationPanel />
      <AdminPayoutsPanel />
    </main>
  );
}
