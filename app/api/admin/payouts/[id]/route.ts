import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { approvePayout, arePayoutTransfersEnabled, initiatePayoutTransfer, isPayoutsEnabled, reconcilePayout, retryFailedPayout, setPayoutHold } from '@/lib/payouts';
import { notifyUsersSafely } from '@/lib/notifications';
import { prisma } from '@/lib/prisma';
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
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    let result!:
      | Awaited<ReturnType<typeof approvePayout>>
      | Awaited<ReturnType<typeof initiatePayoutTransfer>>
      | Awaited<ReturnType<typeof retryFailedPayout>>
      | Awaited<ReturnType<typeof reconcilePayout>>
      | Awaited<ReturnType<typeof setPayoutHold>>;
    let notificationMessage: string | null = null;
    if (parsed.data.action === 'approve') {
      result = await approvePayout(id, admin.id, parsed.data.reason);
      if (result.outcome === 'approved') notificationMessage = 'Your payout has been approved. Transfer execution remains subject to the current payout controls.';
    }
    if (parsed.data.action === 'initiate' && !arePayoutTransfersEnabled()) {
      return NextResponse.json({ error: 'Payout transfers are disabled; approvals can be recorded but no money will be moved.' }, { status: 503 });
    }
    if (parsed.data.action === 'initiate') {
      result = await initiatePayoutTransfer(id);
      if (result.outcome === 'initiated' || result.outcome === 'unknown' || result.outcome === 'failed') {
        notificationMessage = 'Your payout status has been updated. Check the payout dashboard for the latest details.';
      }
    }
    if (parsed.data.action === 'retry') {
      result = await retryFailedPayout(id, admin.id);
      if (result.outcome === 'reset') notificationMessage = 'Your payout is eligible for another reviewed transfer attempt.';
    }
    if (parsed.data.action === 'reconcile') {
      result = await reconcilePayout(id);
      if (result.outcome === 'reconciled') notificationMessage = 'Your payout status was reconciled. Check the payout dashboard for the latest details.';
    }
    if (parsed.data.action === 'hold') {
      result = await setPayoutHold(id, true, parsed.data.reason, admin.id);
      if (result.outcome === 'updated') notificationMessage = 'Your payout has been placed on hold pending review.';
    }
    if (parsed.data.action === 'release') {
      result = await setPayoutHold(id, false, parsed.data.reason, admin.id);
      if (result.outcome === 'updated') notificationMessage = 'Your payout hold has been released and the payout is pending review.';
    }
    if (notificationMessage) {
      const payout = await prisma.payout.findUnique({ where: { id }, select: { recipientId: true, transactionId: true } }).catch((error) => {
        console.error('Could not find payout notification recipient:', error);
        return null;
      });
      if (payout) {
        await notifyUsersSafely({
          userIds: [payout.recipientId],
          type: 'PAYMENT',
          message: notificationMessage,
          eventName: 'notification',
          eventData: { payoutId: id, transactionId: payout.transactionId },
        });
      }
    }
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Admin payout action failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Payout action failed.' }, { status: 502 });
  }
}
