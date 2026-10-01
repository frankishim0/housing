import { isLocalMockPaymentsEnabled } from '@/lib/payments';
import { notFound } from 'next/navigation';
import { LocalMockCheckout } from '@/components/local-mock-checkout';

export const dynamic = 'force-dynamic';

export default function LocalMockPaymentPage() {
  if (!isLocalMockPaymentsEnabled()) notFound();
  return <LocalMockCheckout />;
}
