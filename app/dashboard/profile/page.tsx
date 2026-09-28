import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ProfileSettingsForm } from '@/components/profile-settings-form';

export const dynamic = 'force-dynamic';

export default async function ProfilePage() {
  const sessionUser = await getSessionUser();
  if (!sessionUser) redirect('/auth');
  const user = await prisma.user.findUnique({
    where: { id: sessionUser.id },
    include: { region: true, city: true },
  });
  if (!user) redirect('/auth');

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 lg:px-8">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div><p className="text-sm font-semibold uppercase tracking-wide text-emerald-800">Account</p><h1 className="mt-1 text-3xl font-bold">Global profile</h1></div>
        <Link href="/dashboard" className="text-sm font-semibold text-slate-600 hover:text-emerald-800">Dashboard</Link>
      </div>
      <section className="rounded-lg border border-slate-200 bg-white p-5 sm:p-7">
        <ProfileSettingsForm defaults={{
          phone: user.phone ?? '',
          name: user.name,
          profileImage: user.profileImage ?? '',
          countryCode: user.countryCode ?? '',
          region: user.region?.name ?? '',
          city: user.city?.name ?? '',
          preferredCurrency: user.preferredCurrency,
          preferredLanguage: user.preferredLanguage,
          timeZone: user.timeZone ?? '',
          measurementUnit: user.measurementUnit,
          verificationStatus: user.verificationStatus,
        }} />
      </section>
    </main>
  );
}
