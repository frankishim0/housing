import { FinancialAuditAction, FinancialTransactionStatus, PaymentType, PropertyStatus, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { canTransitionDispute } from '@/lib/transaction-lifecycle';
import { z } from 'zod';

const schema = z.object({
  status: z.enum(['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'REJECTED']),
  resolution: z.string().trim().min(10).max(2000),
  reason: z.string().trim().min(10).max(500),
});

export async function PATCH(request: NextRequest, context: RouteContext<'/api/admin/monetization/disputes/[id]'>) {
  let admin;
  try {
    admin = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required.' : 'Admin role required.' }, { status: unauthenticated ? 401 : 403 });
  }

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const before = await tx.transactionDispute.findUniqueOrThrow({ where: { id } });
      if (!canTransitionDispute(before.status, parsed.data.status)) {
        throw new Error('INVALID_DISPUTE_TRANSITION');
      }
      const completed = parsed.data.status === 'RESOLVED' || parsed.data.status === 'REJECTED';
      const dispute = await tx.transactionDispute.update({
        where: { id },
        data: { status: parsed.data.status, resolution: parsed.data.resolution, resolvedAt: completed ? new Date() : null },
      });
      if (completed) {
        const outstanding = await tx.transactionDispute.count({
          where: { transactionId: before.transactionId, id: { not: id }, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
        });
        if (outstanding === 0) {
          const transaction = await tx.financialTransaction.findUnique({
            where: { id: before.transactionId },
            select: { id: true, propertyId: true, transactionType: true },
          });
          let mayReturnToPaid = true;
          if (transaction?.transactionType === PaymentType.SALE && transaction.propertyId) {
            const [property, anotherPaidSale] = await Promise.all([
              tx.property.findUnique({ where: { id: transaction.propertyId }, select: { status: true } }),
              tx.financialTransaction.count({
                where: {
                  propertyId: transaction.propertyId,
                  id: { not: transaction.id },
                  transactionType: PaymentType.SALE,
                  status: FinancialTransactionStatus.PAID,
                },
              }),
            ]);
            mayReturnToPaid = property?.status === PropertyStatus.SOLD && anotherPaidSale === 0;
          }
          if (mayReturnToPaid) {
            await tx.financialTransaction.updateMany({
              where: { id: before.transactionId, status: FinancialTransactionStatus.DISPUTED },
              data: { status: FinancialTransactionStatus.PAID },
            });
          }
        }
      }
      await tx.financialAuditLog.create({
        data: {
          actorId: admin.id,
          action: FinancialAuditAction.DISPUTE_UPDATED,
          entityType: 'TransactionDispute',
          entityId: dispute.id,
          before: { status: before.status, resolution: before.resolution },
          after: { status: dispute.status, resolution: dispute.resolution },
          reason: parsed.data.reason,
        },
      });
      return dispute;
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && 'code' in error && error.code === 'P2025') {
      return NextResponse.json({ error: 'Dispute not found.' }, { status: 404 });
    }
    if (error instanceof Error && error.message === 'INVALID_DISPUTE_TRANSITION') {
      return NextResponse.json({ error: 'This dispute cannot transition from its current status.' }, { status: 409 });
    }
    throw error;
  }
}
