import { PaymentResultStatus, VerifiedPayment } from '@/lib/payments';

export type PaymentPurchaseKind = 'TRANSACTION' | 'SUBSCRIPTION' | 'FEATURED_LISTING';

export interface PaymentPurchase {
  kind: PaymentPurchaseKind;
  id: string;
  reference: string;
  providerReference: string | null;
  status: string;
  amountMinor: number;
  currency: string;
}

export interface PaymentWebhookRepository<Tx> {
  runOnce<T>(
    eventId: string,
    eventType: string,
    action: (tx: Tx) => Promise<T>,
  ): Promise<{ duplicate: boolean; result?: T }>;
  findPurchase(tx: Tx, reference: string, providerCode: string): Promise<PaymentPurchase | null>;
  settlePurchase(tx: Tx, purchase: PaymentPurchase, payment: VerifiedPayment): Promise<void>;
}

export async function processVerifiedPayment<Tx>(
  payment: VerifiedPayment,
  repository: PaymentWebhookRepository<Tx>,
  providerCode = 'PAYSTACK',
) {
  const eventId = `${providerCode}:${payment.transactionId}:${payment.status}`;
  return repository.runOnce(eventId, `${providerCode.toLowerCase()}.payment.${payment.status}`, async (tx) => {
    const purchase = await repository.findPurchase(tx, payment.reference, providerCode);
    if (!purchase) return 'purchase_not_found';
    if (purchase.providerReference && purchase.providerReference !== payment.reference) {
      throw new Error(`${providerCode} reference does not match the server-side payment.`);
    }
    if (payment.amountMinor !== purchase.amountMinor
      || payment.currency.toUpperCase() !== purchase.currency.toUpperCase()) {
      throw new Error(`${providerCode} amount or currency does not match the server-side purchase.`);
    }

    if (purchase.status === 'PAID' || purchase.status === 'ACTIVE') return 'purchase_already_paid';
    if (purchase.status === 'FAILED'
      || purchase.status === 'CANCELLED'
      || purchase.status === 'EXPIRED'
      || purchase.status === 'DISPUTED'
      || purchase.status === 'PARTIALLY_REFUNDED'
      || purchase.status === 'REFUNDED') {
      return 'purchase_already_final';
    }

    if (payment.status !== 'success' && payment.status !== 'failed' && payment.status !== 'abandoned') {
      return 'payment_not_final';
    }
    await repository.settlePurchase(tx, purchase, payment);
    return paymentStatusOutcome(payment.status);
  });
}

function paymentStatusOutcome(status: PaymentResultStatus) {
  if (status === 'success') return 'payment_confirmed';
  if (status === 'failed') return 'payment_failed';
  return 'payment_abandoned';
}
