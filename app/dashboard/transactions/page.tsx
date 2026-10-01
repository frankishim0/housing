import Link from 'next/link';
import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/international';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const PAYMENT_BANNER: Record<string, { tone: string; message: string }> = {
  success: {
    tone: 'border-emerald-300 bg-emerald-50 text-emerald-900',
    message: 'Payment verified successfully. Your transaction has been marked as paid and the commission/seller amounts below are final.',
  },
  failed: {
    tone: 'border-red-300 bg-red-50 text-red-900',
    message: 'The payment failed. No charge was completed and the transaction remains unpaid — you can request a fresh quote to try again.',
  },
  cancelled: {
    tone: 'border-amber-300 bg-amber-50 text-amber-900',
    message: 'The checkout was cancelled or abandoned before payment completed. The transaction remains unpaid.',
  },
  error: {
    tone: 'border-red-300 bg-red-50 text-red-900',
    message: 'We could not confirm this payment. If you were charged, contact support with your reference — do not retry until this is resolved.',
  },
  pending: {
    tone: 'border-slate-300 bg-slate-50 text-slate-700',
    message: "We're still waiting to confirm this payment with the provider. Refresh this page shortly — the status below updates automatically once verification completes.",
  },
  invalid: {
    tone: 'border-amber-300 bg-amber-50 text-amber-900',
    message: 'The payment return link was missing required details, so no verification was attempted.',
  },
};

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<{ payment?: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  const { payment } = await searchParams;
  const banner = payment ? PAYMENT_BANNER[payment] : undefined;
  const transactions = await prisma.financialTransaction.findMany({
    where: { OR: [{ buyerId: user.id }, { sellerId: user.id }, { agentId: user.id }] },
    include: { property: { select: { title: true } }, payouts: true, refunds: true, disputes: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  const payments = await prisma.payment.findMany({
    where: { userId: user.id },
    include: { property: { select: { title: true } } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  return (
    <main className="mx-auto max-w-5xl px-4 py-10 lg:px-8">
      <Link href="/dashboard" className="text-sm font-semibold text-emerald-800 underline">Back to dashboard</Link>
      <h1 className="mt-3 text-3xl font-bold text-slate-900">Payment history and receipts</h1>
      <p className="mt-2 text-sm text-slate-600">Transaction amounts retain the original currency. Payment status changes only after Paystack verification or the explicitly enabled local-only simulator.</p>
      {banner && <p role="status" className={`mt-4 rounded-2xl border p-4 text-sm font-medium ${banner.tone}`}>{banner.message}</p>}
      <section className="mt-7 space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Marketplace transaction records</h2>
        {transactions.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No transaction records are associated with your account.</p> : transactions.map((item) => (
          <article key={item.id} className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold text-slate-900">{item.property?.title ?? 'Property unavailable'}</h3><p className="mt-1 text-sm text-slate-500">{item.reference} · {item.transactionType} · {item.status}</p></div>
              <p className="text-lg font-bold text-slate-900">{formatCurrency(Number(item.amount), item.currencyCode)}</p>
            </div>
            <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
              <div><dt className="text-slate-500">Platform commission</dt><dd className="font-medium">{formatCurrency(Number(item.platformCommission), item.currencyCode)}</dd></div>
              <div><dt className="text-slate-500">Buyer fee / total due</dt><dd className="font-medium">{formatCurrency(Number(item.buyerPlatformFee), item.currencyCode)} / {formatCurrency(Number(item.totalBuyerDue), item.currencyCode)}</dd></div>
              <div><dt className="text-slate-500">Processing fee</dt><dd className="font-medium">{formatCurrency(Number(item.paymentProcessingFee), item.currencyCode)}</dd></div>
              <div><dt className="text-slate-500">Seller amount / final payout</dt><dd className="font-medium">{formatCurrency(Number(item.sellerAmount), item.currencyCode)} / {formatCurrency(Number(item.finalPayout), item.currencyCode)}</dd></div>
              <div><dt className="text-slate-500">Payout status</dt><dd className="font-medium">{item.payoutStatus}</dd></div>
              <div><dt className="text-slate-500">Created</dt><dd className="font-medium">{new Intl.DateTimeFormat(user.preferredLanguage, { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timeZone ?? undefined }).format(item.createdAt)}</dd></div>
            </dl>
            <p className="mt-3 text-xs text-slate-500">Refunds: {item.refunds.map((refund) => `${refund.status} ${formatCurrency(Number(refund.amount), item.currencyCode)}`).join(', ') || 'none'} · disputes: {item.disputes.map((dispute) => dispute.status).join(', ') || 'none'} · payouts: {item.payouts.map((payout) => `${payout.status} ${formatCurrency(Number(payout.amount), payout.currencyCode)}`).join(', ') || 'none'}</p>
            {item.status === 'PAID' && <Link href={`/dashboard/transactions/${item.id}/receipt`} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">Open receipt</Link>}
          </article>
        ))}
      </section>
      <section className="mt-9 space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Legacy payment records</h2>
        {payments.length === 0 ? <p className="rounded-2xl border border-slate-200 bg-white p-5 text-sm text-slate-500">No legacy payment records.</p> : payments.map((item) => (
          <article key={item.id} className="flex flex-wrap justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-5">
            <div><p className="font-semibold text-slate-900">{item.property?.title ?? 'Marketplace payment'} · {item.paymentType}</p><p className="mt-1 text-xs text-slate-500">{item.reference} · {item.status} · {item.provider}</p></div>
            <p className="font-semibold text-slate-900">{formatCurrency(Number(item.amount), item.currency)}</p>
          </article>
        ))}
      </section>
    </main>
  );
}
