import assert from 'node:assert/strict';
import { PaymentPurchase, PaymentWebhookRepository, processVerifiedPayment } from '../lib/payment-webhook';
import { VerifiedPayment } from '../lib/payments';

type FakeTransaction = {
  events: Set<string>;
  purchase: PaymentPurchase;
  settlements: number;
};

function makeRepository(purchase: PaymentPurchase) {
  const tx: FakeTransaction = { events: new Set(), purchase: { ...purchase }, settlements: 0 };
  const repository: PaymentWebhookRepository<FakeTransaction> = {
    async runOnce(eventId, _eventType, action) {
      if (tx.events.has(eventId)) return { duplicate: true };
      const result = await action(tx);
      tx.events.add(eventId);
      return { duplicate: false, result };
    },
    async findPurchase(transaction, reference) {
      return transaction.purchase.reference === reference ? transaction.purchase : null;
    },
    async settlePurchase(transaction, item, payment) {
      item.status = payment.status === 'success'
        ? 'PAID'
        : payment.status === 'abandoned'
          ? 'CANCELLED'
          : 'FAILED';
      transaction.settlements += 1;
    },
  };
  return { repository, tx };
}

const purchase: PaymentPurchase = {
  kind: 'TRANSACTION',
  id: 'local-financial-transaction',
  reference: 'FQ-local-test',
  providerReference: 'FQ-local-test',
  status: 'PENDING_PAYMENT',
  amountMinor: 663_000_000,
  currency: 'NGN',
};

function payment(status: VerifiedPayment['status']): VerifiedPayment {
  return {
    reference: purchase.reference,
    transactionId: `mock-test-${status}`,
    status,
    amountMinor: purchase.amountMinor,
    currency: purchase.currency,
    paidAt: status === 'success' ? new Date('2026-09-28T12:00:00.000Z') : null,
  };
}

async function main() {
  const keys = [
    'NODE_ENV',
    'PAYMENT_PROVIDER',
    'MOCK_PAYMENTS_ENABLED',
    'MOCK_DATABASE_URL',
    'MOCK_PAYMENT_WEBHOOK_SECRET',
  ] as const;
  const previous = new Map(keys.map((key) => [key, process.env[key]]));
  process.env.PAYMENT_PROVIDER = 'MOCK';
  process.env.MOCK_PAYMENTS_ENABLED = 'true';
  process.env.MOCK_DATABASE_URL = 'postgresql://test:test@localhost:5432/housing_mock?schema=public';
  process.env.MOCK_PAYMENT_WEBHOOK_SECRET = 'local-only-test-secret-with-at-least-32-characters';

  try {
    const payments = await import('../lib/payments');
    assert.equal(payments.isLocalMockPaymentsEnabled(), true);
    assert.equal(new URL(payments.getLocalMockDatabaseUrl()).hostname, 'localhost');
    assert.equal(payments.getPaymentProvider('EUR').code, 'MOCK');
    payments.assertTestPaymentProviderConfiguration('MOCK');

    const provider = payments.getPaymentProvider('NGN');
    const initialized = await provider.initialize({
      email: 'buyer@example.test',
      amountMinor: purchase.amountMinor,
      currency: 'NGN',
      reference: purchase.reference,
      callbackUrl: 'http://localhost:3000/api/payments/verify?reference=FQ-local-test',
      purchaseType: 'TRANSACTION',
    });
    assert.equal(new URL(initialized.authorizationUrl).pathname, '/payments/mock');
    assert.equal(new URL(initialized.authorizationUrl).searchParams.get('reference'), purchase.reference);
    await assert.rejects(provider.verify(purchase.reference), /signed mock webhook flow/);

    const rawBody = JSON.stringify({ event: 'mock.payment.success', reference: purchase.reference });
    const signature = payments.signMockPaymentWebhook(rawBody);
    assert.equal(payments.verifyMockPaymentWebhookSignature(rawBody, signature, process.env.MOCK_PAYMENT_WEBHOOK_SECRET), true);
    assert.equal(payments.verifyMockPaymentWebhookSignature(rawBody, 'invalid', process.env.MOCK_PAYMENT_WEBHOOK_SECRET), false);

    {
      const { repository, tx } = makeRepository(purchase);
      const first = await processVerifiedPayment(payment('success'), repository, 'MOCK');
      const duplicate = await processVerifiedPayment(payment('success'), repository, 'MOCK');
      assert.equal(first.result, 'payment_confirmed');
      assert.equal(duplicate.duplicate, true);
      assert.equal(tx.purchase.status, 'PAID');
      assert.equal(tx.settlements, 1);
    }

    {
      const { repository, tx } = makeRepository(purchase);
      const failed = await processVerifiedPayment(payment('failed'), repository, 'MOCK');
      assert.equal(failed.result, 'payment_failed');
      assert.equal(tx.purchase.status, 'FAILED');
    }

    {
      const { repository, tx } = makeRepository(purchase);
      const cancelled = await processVerifiedPayment(payment('abandoned'), repository, 'MOCK');
      assert.equal(cancelled.result, 'payment_abandoned');
      assert.equal(tx.purchase.status, 'CANCELLED');
    }

    {
      const { repository, tx } = makeRepository(purchase);
      await assert.rejects(
        processVerifiedPayment({ ...payment('success'), amountMinor: purchase.amountMinor + 1 }, repository, 'MOCK'),
        /amount or currency does not match/,
      );
      assert.equal(tx.settlements, 0);
    }

    process.env.MOCK_DATABASE_URL = 'postgresql://test:test@remote.example:5432/housing_mock';
    assert.throws(() => payments.getLocalMockDatabaseUrl(), /localhost/);
    Reflect.set(process.env, 'NODE_ENV', 'production');
    assert.equal(payments.isLocalMockPaymentsEnabled(), false);
    assert.throws(() => payments.assertTestPaymentProviderConfiguration('MOCK'), /disabled/);
  } finally {
    for (const key of keys) {
      const value = previous.get(key);
      if (value === undefined) delete process.env[key];
      else Reflect.set(process.env, key, value);
    }
  }

  console.log('Local mock payment tests passed: local-only guard, server initialization, signed webhook verification, success/failure/cancellation, duplicate delivery, and amount tampering.');
}

void main();
