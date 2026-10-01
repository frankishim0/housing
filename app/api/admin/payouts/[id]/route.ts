import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { approvePayout, initiatePayoutTransfer, isPayoutsEnabled, reconcilePayout, retryFailedPayout, setPayoutHold } from '@/lib/payouts';
import { z } from 'zod';

function authError(error: unknown) {
  const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
  return NextResponse.json(
    { error: unauthenticated ? 'Authentication required.' : 'Admin role required.' },
    { status: unauthenticated ? 401 : 403 },
  );
}

const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve'), reason: z.string().trim().min(10).max(500) }).strict(),
  z.object({ action: z.literal('initiate') }),
  z.object({ action: z.literal('retry') }),
  z.object({ action: z.literal('reconcile') }),
  z.object({ action: z.literal('hold'), reason: z.string().trim().min(10).max(500) }).strict(),
  z.object({ action: z.literal('release'), reason: z.string().trim().min(10).max(500) }).strict(),
]);

export async function POST(request: Request, context: RouteContext<'/api/admin/payouts/[id]'>) {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return authError(error);
  }
  if (!isPayoutsEnabled()) {
    return NextResponse.json({ error: 'Seller payouts are disabled. Set PAYOUTS_ENABLED=true to enable this test-mode-only feature.' }, { status: 503 });
  }

  const { id } = await context.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    if (parsed.data.action === 'approve') return NextResponse.json({ data: await approvePayout(id, admin.id, parsed.data.reason) });
    if (parsed.data.action === 'initiate') return NextResponse.json({ data: await initiatePayoutTransfer(id) });
    if (parsed.data.action === 'retry') return NextResponse.json({ data: await retryFailedPayout(id, admin.id) });
    if (parsed.data.action === 'reconcile') return NextResponse.json({ data: await reconcilePayout(id) });
    if (parsed.data.action === 'hold') return NextResponse.json({ data: await setPayoutHold(id, true, parsed.data.reason, admin.id) });
    return NextResponse.json({ data: await setPayoutHold(id, false, parsed.data.reason, admin.id) });
  } catch (error) {
    console.error('Admin payout action failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payout action failed.' }, { status: 502 });
  }
}
