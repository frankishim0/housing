import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { formatCurrency } from '@/lib/international';
import { prisma } from '@/lib/prisma';
import { PrintButton } from '@/components/print-button';

export const dynamic = 'force-dynamic';

export default async function TransactionReceiptPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  const { id } = await params;
  const transaction = await prisma.financialTransaction.findUnique({
    where: { id },
    include: { property: { select: { title: true } }, buyer: { select: { id: true, name: true } }, seller: { select: { id: true, name: true } }, payment: true },
  });
  if (!transaction || ![transaction.buyerId, transaction.sellerId, transaction.agentId].includes(user.id)) notFound();
  if (transaction.status !== 'PAID') notFound();

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm print:border-0 print:shadow-none">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div><p className="text-sm font-semibold uppercase tracking-widest text-emerald-700">Homes Worldwide</p><h1 className="mt-2 text-3xl font-bold text-slate-900">Transaction receipt</h1></div>
          <PrintButton />
        </div>
        <p className="mt-6 text-sm text-slate-600">Receipt reference <span className="font-semibold text-slate-900">{transaction.reference}</span></p>
        <p className="mt-1 text-sm text-slate-600">Status: {transaction.status} · Paid at {transaction.paidAt ? new Intl.DateTimeFormat(user.preferredLanguage, { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timeZone ?? undefined }).format(transaction.paidAt) : 'not recorded'}</p>
        <div className="mt-6 border-t border-slate-200 pt-5">
          <h2 className="font-semibold text-slate-900">{transaction.property?.title ?? 'Property transaction'}</h2>
          <p className="mt-1 text-sm text-slate-600">{transaction.transactionType} · {transaction.currencyCode} · Buyer {transaction.buyer.name} · Seller {transaction.seller.name}</p>
        </div>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between gap-4"><dt>Original transaction amount</dt><dd className="font-semibold">{formatCurrency(Number(transaction.amount), transaction.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Platform commission</dt><dd>{formatCurrency(Number(transaction.platformCommission), transaction.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Buyer platform fee</dt><dd>{formatCurrency(Number(transaction.buyerPlatformFee), transaction.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Payment-processing fee</dt><dd>{formatCurrency(Number(transaction.paymentProcessingFee), transaction.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4 border-t border-slate-200 pt-3 font-bold"><dt>Total buyer due</dt><dd>{formatCurrency(Number(transaction.totalBuyerDue), transaction.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Seller amount</dt><dd>{formatCurrency(Number(transaction.sellerAmount), transaction.currencyCode)}</dd></div>
          <div className="flex justify-between gap-4"><dt>Final payout</dt><dd>{formatCurrency(Number(transaction.finalPayout), transaction.currencyCode)} · {transaction.payoutStatus}</dd></div>
        </dl>
        {transaction.payment && <p className="mt-5 text-xs text-slate-500">Payment reference {transaction.payment.reference} · {transaction.payment.provider} · {transaction.payment.status}</p>}
        <p className="mt-6 rounded-xl bg-slate-50 p-4 text-xs text-slate-600">This receipt is available only for a server-recorded paid transaction. A quote or pending payment is not a receipt.</p>
        <Link href="/dashboard/transactions" className="mt-6 inline-block text-sm font-semibold text-emerald-800 underline print:hidden">Back to payment history</Link>
      </div>
    </main>
  );
}
