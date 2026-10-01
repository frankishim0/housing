import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { PayoutAccountForm } from '@/components/payout-account-form';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <Link href="/dashboard" className="text-sm font-semibold text-emerald-800 underline">Back to dashboard</Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Seller/agent payouts</h1>
      <p className="mt-2 text-sm text-slate-600">
        Manage the bank account that receives your platform payouts. Payouts use the server-recorded final payout amount from each completed transaction and never a client-supplied value.
      </p>
      <div className="mt-6">
        <PayoutAccountForm />
      </div>
    </main>
  );
}
