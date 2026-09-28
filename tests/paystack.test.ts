import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import {
  amountToMinorUnits,
  getPaystackTestPublicKey,
  getPaymentProvider,
  parseCheckoutBody,
  verifyPaystackWebhookSignature,
  VerifiedPayment,
} from '../lib/payments';
import { PaymentPurchase, PaymentWebhookRepository, processVerifiedPayment } from '../lib/payment-webhook';

type TestTransaction = { events: Set<string>; purchase: PaymentPurchase; updates: number };

function createRepository(purchase: PaymentPurchase) {
  const tx: TestTransaction = { events: new Set(), purchase: { ...purchase }, updates: 0 };
  const repository: PaymentWebhookRepository<TestTransaction> = {
    async runOnce(eventId, _eventType, action) {
      if (tx.events.has(eventId)) return { duplicate: true };
      const result = await action(tx);
      tx.events.add(eventId);
      return { duplicate: false, result };
    },
    async findPurchase(transaction, reference) {
      return transaction.purchase.reference === reference ? transaction.purchase : null;
    },
    async settlePurchase(transaction, purchase, payment) {
      purchase.status = payment.status === 'success'
        ? 'PAID'
        : payment.status === 'abandoned'
          ? 'CANCELLED'
          : 'FAILED';
      transaction.updates += 1;
    },
  };
  return { repository, tx };
}

const basePurchase: PaymentPurchase = {
  kind: 'TRANSACTION',
  id: 'financial-tx-1',
  reference: 'FQ-test-1',
  providerReference: 'FQ-test-1',
  status: 'PENDING_PAYMENT',
  amountMinor: 100_000,
  currency: 'NGN',
};

function verifiedPayment(overrides: Partial<VerifiedPayment> = {}): VerifiedPayment {
  return {
    reference: basePurchase.reference,
    transactionId: 'paystack-test-transaction-1',
    status: 'success',
    amountMinor: basePurchase.amountMinor,
    currency: basePurchase.currency,
    paidAt: new Date('2026-09-28T12:00:00.000Z'),
    ...overrides,
  };
}

async function main() {
  assert.equal(amountToMinorUnits('123.4500', 2), 12345);
  assert.equal(amountToMinorUnits('123.0000', 0), 123);
  assert.throws(() => amountToMinorUnits('1.0010', 2), /minor-unit precision/);
  assert.throws(() => getPaymentProvider('EUR'), /No payment provider is configured/);

  const previousSecret = process.env.PAYSTACK_SECRET_KEY;
  const previousPublicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  process.env.PAYSTACK_SECRET_KEY = 'sk_live_rejected';
  process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY = 'pk_live_rejected';
  await assert.rejects(getPaymentProvider('NGN').initialize({
    email: 'buyer@example.test',
    amountMinor: 100,
    currency: 'NGN',
    reference: 'payment-test',
    callbackUrl: 'https://example.test/verify',
    purchaseType: 'TRANSACTION',
  }), /test mode/);
  assert.throws(() => getPaystackTestPublicKey(), /test mode/);
  if (previousSecret === undefined) delete process.env.PAYSTACK_SECRET_KEY;
  else process.env.PAYSTACK_SECRET_KEY = previousSecret;
  if (previousPublicKey === undefined) delete process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY = previousPublicKey;

  assert.equal(parseCheckoutBody('').success, true);
  for (const key of ['price', 'amount', 'commission', 'fees', 'currency', 'sellerPayout', 'finalPayout']) {
    const parsed = parseCheckoutBody(JSON.stringify({ [key]: key === 'currency' ? 'USD' : 1 }));
    assert.equal(parsed.success, false, `checkout body must reject client-supplied ${key}`);
  }

  const webhookSecret = 'test_webhook_secret';
  const rawBody = JSON.stringify({ event: 'charge.success', data: { reference: basePurchase.reference } });
  const signature = createHmac('sha512', webhookSecret).update(rawBody).digest('hex');
  assert.equal(verifyPaystackWebhookSignature(rawBody, signature, webhookSecret), true);
  const modifiedSignature = `${signature[0] === '0' ? '1' : '0'}${signature.slice(1)}`;
  assert.equal(verifyPaystackWebhookSignature(rawBody, modifiedSignature, webhookSecret), false);
  assert.equal(verifyPaystackWebhookSignature(rawBody, 'invalid', webhookSecret), false);

  {
    const { repository, tx } = createRepository(basePurchase);
    const result = await processVerifiedPayment(verifiedPayment(), repository);
    assert.equal(result.result, 'payment_confirmed');
    assert.equal(tx.purchase.status, 'PAID');
    assert.equal(tx.updates, 1);
  }

  {
    const { repository, tx } = createRepository(basePurchase);
    const result = await processVerifiedPayment(verifiedPayment({ status: 'failed' }), repository);
    assert.equal(result.result, 'payment_failed');
    assert.equal(tx.purchase.status, 'FAILED');
  }

  {
    const { repository, tx } = createRepository(basePurchase);
    const result = await processVerifiedPayment(verifiedPayment({ status: 'abandoned' }), repository);
    assert.equal(result.result, 'payment_abandoned');
    assert.equal(tx.purchase.status, 'CANCELLED');
  }

  {
    const { repository, tx } = createRepository(basePurchase);
    const successfulPayment = verifiedPayment({ transactionId: 'paystack-duplicate' });
    await processVerifiedPayment(successfulPayment, repository);
    const duplicate = await processVerifiedPayment(successfulPayment, repository);
    assert.equal(duplicate.duplicate, true);
    assert.equal(tx.updates, 1);
  }

  {
    const { repository, tx } = createRepository(basePurchase);
    await assert.rejects(
      processVerifiedPayment(verifiedPayment({ amountMinor: basePurchase.amountMinor + 1 }), repository),
      /amount or currency does not match/,
    );
    assert.equal(tx.purchase.status, 'PENDING_PAYMENT');
    assert.equal(tx.updates, 0);
  }

  {
    const { repository, tx } = createRepository(basePurchase);
    await assert.rejects(
      processVerifiedPayment(verifiedPayment({ currency: 'USD' }), repository),
      /amount or currency does not match/,
    );
    assert.equal(tx.purchase.status, 'PENDING_PAYMENT');
  }

  console.log('Paystack payment tests passed: success, failure, abandonment, duplicate, invalid signature, and client financial-value tampering.');
}

void main();
