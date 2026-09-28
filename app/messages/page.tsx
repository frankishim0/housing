import { redirect } from 'next/navigation';
import { getSessionUser } from '@/lib/auth';
import { MessagingInbox } from '@/components/messaging-inbox';

export const dynamic = 'force-dynamic';

export default async function MessagesPage() {
  const user = await getSessionUser();
  if (!user) redirect('/auth');
  return <MessagingInbox currentUserId={user.id} timeZone={user.timeZone} preferredCurrency={user.preferredCurrency} />;
}