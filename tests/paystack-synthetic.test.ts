import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { CommissionPayer } from '@prisma/client';
import {
  amountToMinorUnits,
  getPaymentProvider,
  PaystackProvider,
  verifyPaystackWebhookSignature,
  VerifiedPayment,
} from '../lib/payments';
import { PaymentPurchase, PaymentWebhookRepository, processVerifiedPayment } from '../lib/payment-webhook';
import { calculateCommission } from '../lib/monetization';

// This suite verifies the real Paystack integration code paths (PaystackProvider.initialize/verify,
// webhook signature verification, and settlement) against synthetic/mocked Paystack API responses.
// No live/test card payment or network access to Paystack is used, and no live keys are configured.

type FetchCall = { url: string; init?: RequestInit };

function installFetchMock(handler: (call: FetchCall) => { status: number; body: unknown }) {
  const original = global.fetch;
  const calls: FetchCall[] = [];
  global.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    calls.push({ url, init });
    const { status, body } = handler({ url, init });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore: () => { global.fetch = original; } };
}

function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T): T {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

async function withEnvAsync<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const previous: Record<string, string | undefined> = {};
  for (const key of Object.keys(vars)) previous[key] = process.env[key];
  for (const [key, value] of Object.entries(vars)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
}

const TEST_SECRET_KEY = 'sk_test_synthetic_secret_key';
const TEST_PUBLIC_KEY = 'pk_test_synthetic_public_key';
const TEST_ENV = {
  PAYSTACK_SECRET_KEY: TEST_SECRET_KEY,
  NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY: TEST_PUBLIC_KEY,
  PAYSTACK_WEBHOOK_SECRET: TEST_SECRET_KEY,
  APP_URL: 'http://localhost:3000',
  PAYMENT_PROVIDER: undefined,
  MOCK_PAYMENTS_ENABLED: undefined,
};

const basePurchase: PaymentPurchase = {
  kind: 'TRANSACTION',
  id: 'financial-tx-synthetic-1',
  reference: 'FQ-synthetic-1',
  providerReference: 'FQ-synthetic-1',
  status: 'PENDING_PAYMENT',
  amountMinor: 663_000_000, // NGN 6,630,000.00 in kobo
  currency: 'NGN',
};

function createRepository(purchase: PaymentPurchase) {
  const tx = { events: new Set<string>(), purchase: { ...purchase }, updates: 0 };
  const repository: PaymentWebhookRepository<typeof tx> = {
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

function paystackVerifyPayload(overrides: Record<string, unknown> = {}) {
  return {
    status: true,
    message: 'Verification successful',
    data: {
      id: 6_604_511_797,
      domain: 'test',
      status: 'success',
      reference: basePurchase.reference,
      amount: basePurchase.amountMinor,
      currency: basePurchase.currency,
      gateway_response: 'Successful',
      paid_at: '2026-01-05T10:00:00.000Z',
      created_at: '2026-01-05T09:55:00.000Z',
      channel: 'card',
      metadata: { payment_reference: basePurchase.reference, purchase_type: 'TRANSACTION' },
      ...overrides,
    },
  };
}

async function main() {
  // 1. PaystackProvider.initialize() against a synthetic successful Paystack "initialize" response.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(({ url }) => {
      assert.equal(url, 'https://api.paystack.co/transaction/initialize');
      return {
        status: 200,
        body: {
          status: true,
          message: 'Authorization URL created',
          data: {
            authorization_url: 'https://checkout.paystack.com/synthetic-access-code',
            access_code: 'synthetic-access-code',
            reference: basePurchase.reference,
          },
        },
      };
    });
    try {
      const provider = getPaymentProvider('NGN');
      assert.equal(provider.code, 'PAYSTACK');
      const result = await provider.initialize({
        email: 'buyer@example.test',
        amountMinor: basePurchase.amountMinor,
        currency: 'NGN',
        reference: basePurchase.reference,
        callbackUrl: 'http://localhost:3000/api/payments/verify',
        purchaseType: 'TRANSACTION',
      });
      assert.equal(result.authorizationUrl, 'https://checkout.paystack.com/synthetic-access-code');
      assert.equal(result.reference, basePurchase.reference);
      assert.equal(mock.calls.length, 1);
      const sentBody = JSON.parse(String(mock.calls[0].init?.body));
      assert.equal(sentBody.amount, basePurchase.amountMinor);
      assert.equal(sentBody.currency, 'NGN');
      assert.equal(sentBody.reference, basePurchase.reference);
      const headers = mock.calls[0].init?.headers as Record<string, string>;
      assert.ok(headers.Authorization?.startsWith('Bearer '), 'initialize request must send a Bearer authorization header');
      assert.ok(headers.Authorization.includes(TEST_SECRET_KEY), 'initialize request must authenticate with the configured test secret key');
    } finally {
      mock.restore();
    }
  });

  // 2. PaystackProvider.initialize() surfaces a synthetic Paystack rejection (status:false) as an error.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({
      status: 400,
      body: { status: false, message: 'Invalid currency for merchant' },
    }));
    try {
      const provider = new PaystackProvider();
      await assert.rejects(
        provider.initialize({
          email: 'buyer@example.test',
          amountMinor: basePurchase.amountMinor,
          currency: 'NGN',
          reference: basePurchase.reference,
          callbackUrl: 'http://localhost:3000/api/payments/verify',
          purchaseType: 'TRANSACTION',
        }),
        /Invalid currency for merchant/,
      );
    } finally {
      mock.restore();
    }
  });

  // 3. PaystackProvider.verify() parses a synthetic successful verification response.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(({ url }) => {
      assert.equal(url, `https://api.paystack.co/transaction/verify/${encodeURIComponent(basePurchase.reference)}`);
      return { status: 200, body: paystackVerifyPayload() };
    });
    let verified: VerifiedPayment;
    try {
      verified = await new PaystackProvider().verify(basePurchase.reference);
    } finally {
      mock.restore();
    }
    assert.equal(verified.status, 'success');
    assert.equal(verified.reference, basePurchase.reference);
    assert.equal(verified.transactionId, '6604511797');
    assert.equal(verified.amountMinor, basePurchase.amountMinor);
    assert.equal(verified.currency, 'NGN');
    assert.equal(verified.paidAt?.toISOString(), new Date('2026-01-05T10:00:00.000Z').toISOString());

    // Feed the real, provider-parsed VerifiedPayment into the actual settlement pipeline.
    const { repository, tx } = createRepository(basePurchase);
    const outcome = await processVerifiedPayment(verified, repository);
    assert.equal(outcome.result, 'payment_confirmed');
    assert.equal(tx.purchase.status, 'PAID');
    assert.equal(tx.updates, 1);
  });

  // 4. PaystackProvider.verify() parses a synthetic failed ("Insufficient Funds") verification response.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({
      status: 200,
      body: paystackVerifyPayload({ status: 'failed', gateway_response: 'Insufficient Funds', paid_at: null }),
    }));
    let verified: VerifiedPayment;
    try {
      verified = await new PaystackProvider().verify(basePurchase.reference);
    } finally {
      mock.restore();
    }
    assert.equal(verified.status, 'failed');
    assert.equal(verified.paidAt, null);
    const { repository, tx } = createRepository(basePurchase);
    const outcome = await processVerifiedPayment(verified, repository);
    assert.equal(outcome.result, 'payment_failed');
    assert.equal(tx.purchase.status, 'FAILED');
  });

  // 5. PaystackProvider.verify() parses a synthetic abandoned/cancelled verification response.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({
      status: 200,
      body: paystackVerifyPayload({ status: 'abandoned', gateway_response: 'Abandoned', paid_at: null }),
    }));
    let verified: VerifiedPayment;
    try {
      verified = await new PaystackProvider().verify(basePurchase.reference);
    } finally {
      mock.restore();
    }
    assert.equal(verified.status, 'abandoned');
    const { repository, tx } = createRepository(basePurchase);
    const outcome = await processVerifiedPayment(verified, repository);
    assert.equal(outcome.result, 'payment_abandoned');
    assert.equal(tx.purchase.status, 'CANCELLED');
  });

  // 6. PaystackProvider.verify() rejects a non-final ("ongoing"/pending) synthetic status.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({
      status: 200,
      body: paystackVerifyPayload({ status: 'ongoing', paid_at: null }),
    }));
    try {
      await assert.rejects(new PaystackProvider().verify(basePurchase.reference), /not in a final state/);
    } finally {
      mock.restore();
    }
  });

  // 7. PaystackProvider.verify() rejects an incomplete/malformed synthetic response.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({
      status: 200,
      body: { status: true, message: 'ok', data: { status: 'success', reference: basePurchase.reference } },
    }));
    try {
      await assert.rejects(new PaystackProvider().verify(basePurchase.reference), /incomplete verified transaction details/);
    } finally {
      mock.restore();
    }
  });

  // 8. Duplicate webhook delivery for the same synthetic successful transaction is a no-op (settles once only).
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({ status: 200, body: paystackVerifyPayload() }));
    let verified: VerifiedPayment;
    try {
      verified = await new PaystackProvider().verify(basePurchase.reference);
    } finally {
      mock.restore();
    }
    const { repository, tx } = createRepository(basePurchase);
    const first = await processVerifiedPayment(verified, repository);
    const duplicate = await processVerifiedPayment(verified, repository);
    assert.equal(first.duplicate, false);
    assert.equal(duplicate.duplicate, true);
    assert.equal(tx.updates, 1);
  });

  // 9. A synthetic verification response whose amount/currency does not match the stored purchase is rejected
  //    before settlement runs — the client/gateway can never override the server-recorded transaction value.
  await withEnvAsync(TEST_ENV, async () => {
    const mock = installFetchMock(() => ({
      status: 200,
      body: paystackVerifyPayload({ amount: basePurchase.amountMinor + 100 }),
    }));
    let verified: VerifiedPayment;
    try {
      verified = await new PaystackProvider().verify(basePurchase.reference);
    } finally {
      mock.restore();
    }
    const { repository, tx } = createRepository(basePurchase);
    await assert.rejects(processVerifiedPayment(verified, repository), /amount or currency does not match/);
    assert.equal(tx.purchase.status, 'PENDING_PAYMENT');
    assert.equal(tx.updates, 0);
  });

  // 10. Realistic Paystack `charge.success` webhook payload: signature construction/verification (HMAC-SHA512
  //     over the raw body, using the Paystack secret key) matches production `app/api/webhooks/paystack/route.ts`.
  withEnv(TEST_ENV, () => {
    const webhookPayload = {
      event: 'charge.success',
      data: {
        id: 6_604_511_797,
        reference: basePurchase.reference,
        amount: basePurchase.amountMinor,
        currency: basePurchase.currency,
        status: 'success',
        metadata: { payment_reference: basePurchase.reference, purchase_type: 'TRANSACTION' },
      },
    };
    const rawBody = JSON.stringify(webhookPayload);
    const validSignature = createHmac('sha512', TEST_SECRET_KEY).update(rawBody).digest('hex');
    assert.equal(verifyPaystackWebhookSignature(rawBody, validSignature, TEST_SECRET_KEY), true);

    const tamperedBody = JSON.stringify({ ...webhookPayload, data: { ...webhookPayload.data, amount: 1 } });
    assert.equal(verifyPaystackWebhookSignature(tamperedBody, validSignature, TEST_SECRET_KEY), false);

    const wrongSecretSignature = createHmac('sha512', 'sk_test_wrong_secret').update(rawBody).digest('hex');
    assert.equal(verifyPaystackWebhookSignature(rawBody, wrongSecretSignature, TEST_SECRET_KEY), false);
  });

  // 11. Transaction commission calculation for the ₦6,500,000 test property with the configured 2%
  //     buyer-pays platform fee: buyer total ₦6,630,000, seller receives the full listing price.
  {
    const breakdown = calculateCommission({
      amount: '6500000.0000',
      percentageRate: '2.0000',
      fixedFee: '0.0000',
      processingFeeRate: '0.0000',
      processingFeeFixed: '0.0000',
      payer: CommissionPayer.BUYER,
      minorUnits: 2,
    });
    assert.equal(breakdown.amount, '6500000.0000');
    assert.equal(breakdown.platformCommission, '130000.0000');
    assert.equal(breakdown.buyerPlatformFee, '130000.0000');
    assert.equal(breakdown.sellerCommission, '0.0000');
    assert.equal(breakdown.totalBuyerDue, '6630000.0000');
    assert.equal(breakdown.sellerAmount, '6500000.0000');
    assert.equal(breakdown.finalPayout, '6500000.0000');
    // amountToMinorUnits must convert the same buyer-due amount to the kobo value Paystack is charged.
    assert.equal(amountToMinorUnits(breakdown.totalBuyerDue.slice(0, -2), 2), basePurchase.amountMinor);
  }

  console.log('Paystack synthetic integration tests passed: initialize, verify (success/failed/abandoned/pending/malformed), webhook signature, duplicate webhook, amount tampering, and commission calculation.');
}

void main();
