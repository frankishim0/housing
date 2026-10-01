import { z } from 'zod';
import {
  getMockPaymentWebhookSecret,
  signMockPaymentWebhook,
  verifyMockPaymentWebhookSignature,
  VerifiedPayment,
} from '@/lib/payments';
import { processMockPayment } from '@/lib/paystack-purchases';

const eventSchema = z.object({
  event: z.enum(['mock.payment.success', 'mock.payment.failed', 'mock.payment.abandoned']),
  data: z.object({
    reference: z.string().min(1).max(100),
    transaction_id: z.string().min(1).max(160),
    status: z.enum(['success', 'failed', 'abandoned']),
    amount: z.number().int().positive().safe(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    paid_at: z.string().datetime().nullable(),
  }).strict(),
}).strict();

export function createMockWebhookPayload(payment: VerifiedPayment) {
  const rawBody = JSON.stringify({
    event: `mock.payment.${payment.status}`,
    data: {
      reference: payment.reference,
      transaction_id: payment.transactionId,
      status: payment.status,
      amount: payment.amountMinor,
      currency: payment.currency.toUpperCase(),
      paid_at: payment.paidAt?.toISOString() ?? null,
    },
  });
  return { rawBody, signature: signMockPaymentWebhook(rawBody) };
}

export async function processSignedMockWebhook(rawBody: string, signature: string) {
  const secret = getMockPaymentWebhookSecret();
  if (!verifyMockPaymentWebhookSignature(rawBody, signature, secret)) {
    return { ok: false as const, status: 400, error: 'Invalid local mock webhook signature.' };
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return { ok: false as const, status: 400, error: 'Invalid local mock webhook payload.' };
  }
  const parsed = eventSchema.safeParse(payload);
  if (!parsed.success || parsed.data.event !== `mock.payment.${parsed.data.data.status}`) {
    return { ok: false as const, status: 400, error: 'Invalid local mock webhook payload.' };
  }

  const { data } = parsed.data;
  const payment: VerifiedPayment = {
    reference: data.reference,
    transactionId: data.transaction_id,
    status: data.status,
    amountMinor: data.amount,
    currency: data.currency,
    paidAt: data.paid_at ? new Date(data.paid_at) : null,
  };
  const result = await processMockPayment(payment);
  return { ok: true as const, result };
}
