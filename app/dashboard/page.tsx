import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BellRing, BriefcaseBusiness, Home, MessageSquareText, Wallet } from 'lucide-react';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const recentActivity = [
  { title: 'New viewing request for Maitama duplex', time: 'Today • 10:40 AM' },
  { title: 'Payment confirmed for Ikeja apartment', time: 'Yesterday • 4:10 PM' },
  { title: 'Listing approved by admin', time: '2 days ago • 9:00 AM' },
];

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');

  const ownershipFilter = { OR: [{ ownerId: user.id }, { agentId: user.id }] };
  const [totalListings, activeListings, enquiries, occupiedProperties, availableProperties, revenue] = await prisma.$transaction([
    prisma.property.count({ where: ownershipFilter }),
    prisma.property.count({ where: { ...ownershipFilter, status: 'PUBLISHED' } }),
    prisma.enquiry.count({ where: { property: ownershipFilter } }),
    prisma.property.count({ where: { ...ownershipFilter, status: { in: ['RENTED', 'SOLD'] } } }),
    prisma.property.count({ where: { ...ownershipFilter, status: 'PUBLISHED' } }),
    prisma.payment.aggregate({ where: { property: ownershipFilter, status: 'SUCCESSFUL' }, _sum: { amount: true } }),
  ]);
  const analytics = [
    { label: 'Total listings', value: String(totalListings), tone: 'bg-emerald-100 text-emerald-700' },
    { label: 'Active listings', value: String(activeListings), tone: 'bg-sky-100 text-sky-700' },
    { label: 'Enquiries', value: String(enquiries), tone: 'bg-violet-100 text-violet-700' },
    { label: 'Revenue', value: `₦${Number(revenue._sum.amount ?? 0).toLocaleString('en-NG')}`, tone: 'bg-amber-100 text-amber-700' },
  ];

  return (
    <main className="mx-auto max-w-7xl px-4 py-10 lg:px-8">
      <div className="mb-8 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-600">Dashboard</p>
          <h1 className="mt-2 text-4xl font-bold text-slate-900">Owner & agent overview</h1>
        </div>
        <Link href="/listings/new" className="rounded-full bg-emerald-600 px-5 py-3 font-semibold text-white">Add property</Link>
      </div>

      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-4">
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
            {recentActivity.map((item) => (
              <div key={item.title} className="flex items-center justify-between border-b border-slate-100 pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-emerald-100 text-emerald-700"><BellRing size={16} /></div>
                  <div>
                    <p className="font-medium text-slate-900">{item.title}</p>
                    <p className="text-sm text-slate-500">{item.time}</p>
                  </div>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700">New</span>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[28px] border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="text-2xl font-bold text-slate-900">Quick actions</h2>
          <p className="mt-2 text-sm text-slate-500">{occupiedProperties} occupied and {availableProperties} available properties.</p>
          <div className="mt-5 space-y-3">
            {['Viewings', 'Enquiries', 'Payments', 'Analytics'].map((action) => (
              <Link key={action} href="/search" className="block rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-100">{action}</Link>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
