import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { ReportForm } from '@/components/report-form';

export const dynamic = 'force-dynamic';

export default async function ReportPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  const params = await searchParams;
  return (
    <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <h1 className="text-3xl font-bold text-slate-900">Report a concern</h1>
      <p className="mt-2 text-sm text-slate-600">Use this form to report a property, user, agent, or message for review.</p>
      <section className="mt-6 rounded-2xl border border-slate-200 bg-white p-6">
        <ReportForm
          defaultTargetType={typeof params.targetType === 'string' ? params.targetType : 'PROPERTY'}
          defaultPropertyId={typeof params.propertyId === 'string' ? params.propertyId : ''}
          defaultTargetUserId={typeof params.targetUserId === 'string' ? params.targetUserId : ''}
          defaultMessageId={typeof params.messageId === 'string' ? params.messageId : ''}
        />
      </section>
    </main>
  );
}
