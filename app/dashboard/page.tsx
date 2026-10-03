import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BriefcaseBusiness, Home, MessageSquareText, Wallet } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatCurrency } from '@/lib/international';
import { NotificationCenter } from '@/components/notification-center';
import { FinancialTransactionStatus, UserRole } from '@prisma/client';
import { MonetizationOffers } from '@/components/monetization-offers';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');

  const ownershipFilter = { OR: [{ ownerId: user.id }, { agentId: user.id }] };
  const professionalRoles: UserRole[] = [UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER];
  const isProfessional = professionalRoles.includes(user.role);
  const [totalListings, activeListings, enquiries, occupiedProperties, availableProperties, revenue, views, calls, recentCalls, financialTransactions, financialTotals, payoutTotals] = await Promise.all([
    prisma.property.count({ where: ownershipFilter }),
    prisma.property.count({ where: { ...ownershipFilter, status: 'PUBLISHED' } }),
    prisma.enquiry.count({ where: { property: ownershipFilter } }),
    prisma.property.count({ where: { ...ownershipFilter, status: { in: ['RENTED', 'SOLD'] } } }),
    prisma.property.count({ where: { ...ownershipFilter, status: 'PUBLISHED' } }),
    prisma.payment.groupBy({ by: ['currency'], where: { property: ownershipFilter, status: 'SUCCESSFUL' }, _sum: { amount: true }, orderBy: { currency: 'asc' } }),
    prisma.property.aggregate({ where: ownershipFilter, _sum: { viewCount: true } }),
    prisma.callSession.count({ where: { property: ownershipFilter } }),
    prisma.callSession.findMany({
      where: { property: ownershipFilter },
      include: { property: { select: { title: true, slug: true } } },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.financialTransaction.findMany({
      where: { OR: [{ buyerId: user.id }, { sellerId: user.id }, { agentId: user.id }] },
      include: {
        property: { select: { title: true, slug: true } },
        buyer: { select: { name: true } },
        payouts: { select: { amount: true, currencyCode: true, status: true, completedAt: true } },
        refunds: { select: { amount: true, status: true } },
        disputes: { select: { status: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 25,
    }),
    prisma.financialTransaction.groupBy({
      by: ['currencyCode', 'status'],
      where: { OR: isProfessional ? [{ sellerId: user.id }, { agentId: user.id }] : [] },
      orderBy: [{ currencyCode: 'asc' }, { status: 'asc' }],
      _sum: { amount: true, platformCommission: true, paymentProcessingFee: true, sellerAmount: true, finalPayout: true },
    }),
    prisma.payout.groupBy({
      by: ['currencyCode', 'status'],
      where: { recipientId: user.id, recipient: { role: { in: professionalRoles } } },
      orderBy: [{ currencyCode: 'asc' }, { status: 'asc' }],
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const promotableProperties = isProfessional ? await prisma.property.findMany({
    where: { ...ownershipFilter, status: 'PUBLISHED' },
    select: { id: true, title: true },
    orderBy: { title: 'asc' },
  }) : [];
  const analytics = [
    { label: 'Total listings', value: String(totalListings), tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Active listings', value: String(activeListings), tone: 'bg-sky-100 text-sky-700' },
    { label: 'Enquiries', value: String(enquiries), tone: 'bg-violet-100 text-violet-700' },
    { label: 'Property views', value: String(views._sum.viewCount ?? 0), tone: 'bg-cyan-100 text-cyan-700' },
    { label: 'Calls & tours', value: String(calls), tone: 'bg-rose-100 text-rose-700' },
    { label: 'Recorded payments', value: revenue.length ? revenue.map((item) => formatCurrency(Number(item._sum?.amount ?? 0), item.currency)).join(' · ') : 'No payments', tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Dashboard</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">Property professional overview</h1>
        </div>
        <div className="flex items-center gap-3">
          <NotificationCenter />
          <Link href="/listings/new" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white">Add property</Link>
        </div>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-6">
        {analytics.map((item) => (
          <div key={item.label} className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className={`inline-flex rounded-2xl p-3 ${item.tone}`}>
              {item.label.includes('Revenue') ? <Wallet size={18} /> : item.label.includes('Enquiries') ? <MessageSquareText size={18} /> : item.label.includes('listing') ? <Home size={18} /> : <BriefcaseBusiness size={18} />}
            </div>
            <p className="mt-4 text-3xl font-bold text-slate-900">{item.value}</p>
            <p className="mt-1 text-sm text-slate-500">{item.label}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Recent activity</h2>
          <div className="mt-5 space-y-4">
            {recentCalls.length === 0 ? <p className="text-sm text-slate-500">Calls and live tours linked to your properties will appear here.</p> : recentCalls.map((call) => (
              <Link key={call.id} href={`/properties/${call.property.slug}`} className="block rounded-xl border border-slate-100 p-3 hover:bg-slate-50">
                <span className="block text-sm font-semibold text-slate-900">{call.type === 'LIVE_TOUR' ? 'Live property tour' : 'Video call'} · {call.property.title}</span>
                <span className="mt-1 block text-xs text-slate-500">{call.status} · {new Intl.DateTimeFormat(user.preferredLanguage, { dateStyle: 'medium', timeStyle: 'short', timeZone: user.timeZone ?? undefined }).format(call.createdAt)}</span>
              </Link>
            ))}
          </div>
        </div>
        {(isProfessional || financialTransactions.length > 0) && <section className="mt-8 space-y-5 xl:col-span-2">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Transactions and earnings</h2>
                <p className="mt-1 text-sm text-slate-500">Amounts are shown in each transaction&apos;s original currency. A quote is not a payment or a completed sale.</p>
              </div>
              <Link href="/dashboard/transactions" className="rounded-full border border-emerald-700 px-4 py-2 text-sm font-semibold text-emerald-800">Payment history and receipts</Link>
              <Link href="/dashboard/payouts" className="rounded-full border border-indigo-700 px-4 py-2 text-sm font-semibold text-indigo-800">Payout bank account</Link>
            </div>
            {isProfessional && <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {financialTotals.map((item) => <div key={`${item.currencyCode}-${item.status}`} className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="text-sm font-semibold text-slate-600">{item.status} · {item.currencyCode}</p>
                <p className="mt-2 text-lg font-bold text-slate-900">Gross {formatCurrency(Number(item._sum.amount ?? 0), item.currencyCode)}</p>
                <p className="mt-1 text-sm text-slate-600">Commission {formatCurrency(Number(item._sum.platformCommission ?? 0), item.currencyCode)} · fees {formatCurrency(Number(item._sum.paymentProcessingFee ?? 0), item.currencyCode)}</p>
                <p className="mt-1 text-sm text-slate-600">Estimated seller amount {formatCurrency(Number(item._sum.sellerAmount ?? 0), item.currencyCode)} · payout {formatCurrency(Number(item._sum.finalPayout ?? 0), item.currencyCode)}</p>
              </div>)}
            </div>}
            {isProfessional && <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-bold text-slate-900">Payout status</h3>
              {payoutTotals.length === 0 ? <p className="mt-3 text-sm text-slate-500">No payout records are due yet. A payout is not created for quotes or uncollected payments.</p> : <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">{payoutTotals.map((item) => <p key={`${item.currencyCode}-${item.status}`} className="rounded-xl bg-slate-50 p-3 text-sm"><span className="font-semibold">{item.status}</span> · {formatCurrency(Number(item._sum.amount ?? 0), item.currencyCode)} ({item._count._all})</p>)}</div>}
              <div className="mt-5 space-y-3">
                {financialTransactions.length === 0 ? <p className="text-sm text-slate-500">No transaction records yet.</p> : financialTransactions.map((transaction) => <article key={transaction.id} className="rounded-2xl border border-slate-100 p-4">
                  <div className="flex flex-wrap justify-between gap-2"><p className="font-semibold text-slate-900">{transaction.property?.title ?? 'Property'} · {transaction.status}</p><p className="text-sm text-slate-600">{transaction.transactionType} · {transaction.reference}</p></div>
                  <p className="mt-1 text-sm text-slate-600">Buyer {transaction.buyer.name} · Original price {formatCurrency(Number(transaction.amount), transaction.currencyCode)} · platform commission {formatCurrency(Number(transaction.platformCommission), transaction.currencyCode)}</p>
                  <p className="mt-1 text-sm text-slate-600">Processing fee {formatCurrency(Number(transaction.paymentProcessingFee), transaction.currencyCode)} · estimated final payout {formatCurrency(Number(transaction.finalPayout), transaction.currencyCode)} · payout {transaction.payoutStatus}</p>
                  <p className="mt-1 text-xs text-slate-500">Refunds: {transaction.refunds.map((refund) => `${refund.status} ${formatCurrency(Number(refund.amount), transaction.currencyCode)}`).join(', ') || 'none'} · disputes: {transaction.disputes.map((dispute) => dispute.status).join(', ') || 'none'}</p>
                  {transaction.status === FinancialTransactionStatus.PAID && <Link href={`/dashboard/transactions/${transaction.id}/receipt`} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">View receipt</Link>}
                </article>)}
              </div>
            </div>}
            {!isProfessional && <div className="rounded-3xl border border-slate-200 bg-white p-6">
              <h3 className="text-lg font-bold text-slate-900">Your transaction history</h3>
              <div className="mt-5 space-y-3">
                {financialTransactions.map((transaction) => <article key={transaction.id} className="rounded-2xl border border-slate-100 p-4">
                  <p className="font-semibold text-slate-900">{transaction.property?.title ?? 'Property'} · {transaction.status}</p>
                  <p className="mt-1 text-sm text-slate-600">{transaction.reference} · {transaction.transactionType} · {formatCurrency(Number(transaction.amount), transaction.currencyCode)}</p>
                  <p className="mt-1 text-sm text-slate-600">Platform fee {formatCurrency(Number(transaction.buyerPlatformFee), transaction.currencyCode)} · total due {formatCurrency(Number(transaction.totalBuyerDue), transaction.currencyCode)}</p>
                  {transaction.status === FinancialTransactionStatus.PAID && <Link href={`/dashboard/transactions/${transaction.id}/receipt`} className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">View receipt</Link>}
                </article>)}
              </div>
            </div>}
        </section>}
      {isProfessional && <MonetizationOffers properties={promotableProperties} />}

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Quick actions</h2>
          <p className="mt-2 text-sm text-slate-500">{occupiedProperties} occupied and {availableProperties} available properties.</p>
          <div className="mt-5 space-y-3">
            {isProfessional && <Link href="/dashboard/listings" className="block rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">My Listings</Link>}
            <Link href="/messages" className="flex items-center justify-between rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800">Messages <MessageSquareText size={16} /></Link>
            <Link href="/dashboard/profile" className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">Global profile settings</Link>
            <Link href="/dashboard/viewings" className="block rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-800 hover:bg-emerald-100">Property viewings</Link>
            {['Enquiries', 'Payments', 'Analytics'].map((action) => (
              <Link key={action} href="/search" className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">{action}</Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
