import { FinancialAuditAction, FinancialTransactionStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ reason: z.string().trim().min(10).max(2000) });

export async function POST(request: NextRequest, context: RouteContext<'/api/transactions/[id]/disputes'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;

  try {
    const dispute = await prisma.$transaction(async (tx) => {
      const transaction = await tx.financialTransaction.findUnique({ where: { id } });
      if (!transaction || ![transaction.buyerId, transaction.sellerId].includes(user.id)) {
        throw new Error('TRANSACTION_NOT_FOUND');
      }
      if (transaction.status !== FinancialTransactionStatus.PAID) {
        throw new Error('TRANSACTION_NOT_PAID');
      }
      const created = await tx.transactionDispute.create({
        data: { transactionId: transaction.id, reason: parsed.data.reason },
      });
      const payouts = await tx.payout.findMany({
        where: { transactionId: transaction.id, status: { in: ['PENDING', 'FAILED'] } },
        select: { id: true, status: true, approvedAt: true },
      });
      if (payouts.length > 0) {
        await tx.payout.updateMany({
          where: { id: { in: payouts.map((payout) => payout.id) }, status: { in: ['PENDING', 'FAILED'] } },
          data: { status: 'HELD', approvedAt: null, approvedById: null },
        });
        for (const payout of payouts) {
          await tx.financialAuditLog.create({
            data: {
              actorId: user.id,
              action: FinancialAuditAction.PAYOUT_UPDATED,
              entityType: 'Payout',
              entityId: payout.id,
              before: { status: payout.status, approvedAt: payout.approvedAt?.toISOString() ?? null },
              after: { status: 'HELD', approvedAt: null },
              reason: `Payout held for dispute ${created.id}; administrator review is required before release.`,
            },
          });
        }
      }
      await tx.financialTransaction.update({
        where: { id: transaction.id },
        data: {
          status: FinancialTransactionStatus.DISPUTED,
          ...(payouts.length > 0 ? { payoutStatus: 'HELD' } : {}),
        },
      });
      await tx.financialAuditLog.create({
        data: {
          actorId: user.id,
          action: FinancialAuditAction.DISPUTE_UPDATED,
          entityType: 'TransactionDispute',
          entityId: created.id,
          before: { transactionStatus: transaction.status },
          after: { transactionStatus: FinancialTransactionStatus.DISPUTED, disputeStatus: created.status },
          reason: parsed.data.reason,
        },
      });
      return created;
    });
    return NextResponse.json({ data: dispute }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === 'TRANSACTION_NOT_FOUND') {
      return NextResponse.json({ error: 'Transaction not found.' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'TRANSACTION_NOT_PAID') {
      return NextResponse.json({ error: 'Only paid transactions may be disputed.' }, { status: 409 });
    }
    if (error instanceof Error && 'code' in error && error.code === 'P2002') {
      return NextResponse.json({ error: 'A dispute is already recorded for this transaction.' }, { status: 409 });
    }
    throw error;
  }
}
