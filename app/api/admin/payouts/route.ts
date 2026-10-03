import { NextRequest, NextResponse } from 'next/server';
import { PayoutStatus, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { arePayoutTransfersEnabled, createEligiblePayouts, isPayoutsEnabled } from '@/lib/payouts';
import { prisma } from '@/lib/prisma';
import { notifyUsersSafely } from '@/lib/notifications';
import { z } from 'zod';

function authError(error: unknown) {
  const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
  return NextResponse.json(
    { error: unauthenticated ? 'Authentication required.' : 'Admin role required.' },
    { status: unauthenticated ? 401 : 403 },
  );
}

const actionSchema = z.object({ action: z.literal('run_scheduler') }).strict();

export async function GET(request: NextRequest) {
  try {
    await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return authError(error);
  }

  const status = request.nextUrl.searchParams.get('status');
  const where = status && Object.values(PayoutStatus).includes(status as PayoutStatus)
    ? { status: status as PayoutStatus }
    : {};

  const [payouts, statusCounts] = await Promise.all([
    prisma.payout.findMany({
      where,
      include: {
        transaction: {
          select: {
            id: true,
            reference: true,
            propertyId: true,
            status: true,
            payoutDueAt: true,
            property: { select: { title: true } },
          },
        },
        recipient: { select: { id: true, name: true, email: true } },
        payoutAccount: { select: { bankName: true, accountNumberLast4: true, status: true } },
        approvedBy: { select: { id: true, name: true, email: true } },
      },
      orderBy: { requestedAt: 'desc' },
      take: 100,
    }),
    prisma.payout.groupBy({ by: ['status', 'currencyCode'], _sum: { amount: true }, _count: { _all: true } }),
  ]);

  return NextResponse.json({
    data: payouts,
    statusCounts,
    payoutsEnabled: isPayoutsEnabled(),
    transfersEnabled: arePayoutTransfersEnabled(),
  });
}

export async function POST(request: NextRequest) {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return authError(error);
  }
  void admin;

  if (!isPayoutsEnabled()) {
    return NextResponse.json({ error: 'Seller payouts are disabled. Set PAYOUTS_ENABLED=true to enable this test-mode-only feature.' }, { status: 503 });
  }

  const parsed = actionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const created = await createEligiblePayouts();
  if (!created.disabled) {
    const payoutIds = created.results.flatMap((result) => (
      (result.outcome === 'created' || result.outcome === 'held_unsupported_currency') && result.payoutId
        ? [result.payoutId]
        : []
    ));
    const payouts = await prisma.payout.findMany({
      where: { id: { in: payoutIds } },
      select: { id: true, recipientId: true, transactionId: true, status: true },
    }).catch((error) => {
      console.error('Could not load newly created payout notification recipients:', error);
      return [];
    });
    await Promise.all(payouts.map((payout) => notifyUsersSafely({
      userIds: [payout.recipientId],
      type: 'PAYMENT',
      message: payout.status === 'HELD'
        ? 'A payout record was created for your settled transaction but is on hold. Check the payout dashboard for details.'
        : 'A payout record has been created for your settled transaction. It remains subject to review and transfer controls.',
      eventName: 'notification',
      eventData: { payoutId: payout.id, transactionId: payout.transactionId, status: payout.status },
    })));
  }
  return NextResponse.json({
    data: {
      eligibilityScan: created,
      transfersInitiated: 0,
      message: 'Payout records are not transferred automatically. Admin review and approval are required before initiation.',
    },
  });
}
