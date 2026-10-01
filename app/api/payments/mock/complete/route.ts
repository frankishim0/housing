import { createHash } from 'node:crypto';
import { FinancialTransactionStatus, PaymentStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { amountToMinorUnits, isLocalMockPaymentsEnabled } from '@/lib/payments';
import { createMockWebhookPayload, processSignedMockWebhook } from '@/lib/mock-payment-webhook';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const schema = z.object({
  reference: z.string().min(1).max(100),
  outcome: z.enum(['success', 'failed', 'abandoned']),
  replay: z.boolean().optional(),
}).strict();

export async function POST(request: NextRequest) {
  if (!isLocalMockPaymentsEnabled()) {
    return NextResponse.json({ error: 'Local mock payments are disabled.' }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { reference, outcome, replay = false } = parsed.data;

  try {
    const payment = await prisma.payment.findUnique({
      where: { reference },
      include: {
        currencyData: { select: { minorUnits: true } },
        financialTransaction: { select: { status: true } },
      },
    });
    if (!payment || payment.userId !== user.id || payment.provider !== 'MOCK'
      || payment.providerReference !== reference) {
      return NextResponse.json({ error: 'Local mock payment not found.' }, { status: 404 });
    }

    if (replay) {
      const expectedTransactionStatus = outcome === 'success'
        ? FinancialTransactionStatus.PAID
        : outcome === 'failed'
          ? FinancialTransactionStatus.FAILED
          : FinancialTransactionStatus.CANCELLED;
      if (payment.status === PaymentStatus.PENDING
        || (payment.financialTransaction && payment.financialTransaction.status !== expectedTransactionStatus)) {
        return NextResponse.json({ error: 'Only the matching finalized mock webhook can be replayed.' }, { status: 409 });
      }
    } else if (payment.status !== PaymentStatus.PENDING
      || (payment.financialTransaction
        && payment.financialTransaction.status !== FinancialTransactionStatus.PENDING_PAYMENT)) {
      return NextResponse.json({ error: 'This mock payment already has a final status. Replay its matching webhook instead.' }, { status: 409 });
    }

    const amountMinor = amountToMinorUnits(payment.amount.toString(), payment.currencyData.minorUnits);
    const transactionHash = createHash('sha256').update(`${reference}:${outcome}`).digest('hex').slice(0, 32);
    const { rawBody, signature } = createMockWebhookPayload({
      reference,
      transactionId: `mock_${transactionHash}`,
      status: outcome,
      amountMinor,
      currency: payment.currency,
      paidAt: outcome === 'success' ? new Date() : null,
    });
    const webhook = await processSignedMockWebhook(rawBody, signature);
    if (!webhook.ok) return NextResponse.json({ error: webhook.error }, { status: webhook.status });

    const updated = await prisma.payment.findUniqueOrThrow({
      where: { id: payment.id },
      include: { financialTransaction: true },
    });
    return NextResponse.json({
      data: {
        webhookVerified: true,
        duplicate: webhook.result.duplicate,
        outcome: webhook.result.result ?? 'duplicate_webhook_ignored',
        simulatedOutcome: outcome,
        paymentStatus: updated.status,
        transactionStatus: updated.financialTransaction?.status ?? null,
        transaction: updated.financialTransaction ? {
          amount: updated.financialTransaction.amount.toString(),
          platformCommission: updated.financialTransaction.platformCommission.toString(),
          buyerPlatformFee: updated.financialTransaction.buyerPlatformFee.toString(),
          totalBuyerDue: updated.financialTransaction.totalBuyerDue.toString(),
          sellerAmount: updated.financialTransaction.sellerAmount.toString(),
          finalPayout: updated.financialTransaction.finalPayout.toString(),
          currencyCode: updated.financialTransaction.currencyCode,
        } : null,
      },
    });
  } catch (error) {
    console.error('Local mock payment completion failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Local mock payment could not be completed.' }, { status: 500 });
  }
}
