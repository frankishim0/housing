import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { FinancialTransactionStatus, Prisma } from '@prisma/client';
import { POST as processRefundRequest } from '../app/api/admin/monetization/refunds/route';
import {
  canRetryPayout,
  arePayoutTransfersEnabled,
  assertPayoutsTestConfiguration,
  computePayoutDueAt,
  createPayoutRecordForPaidTransaction,
  createTransferRecipient,
  decryptAccountNumber,
  encryptAccountNumber,
  getPayoutBlockReason,
  getPayoutRetryAt,
  initiateTransfer,
  isPaystackTransferEvent,
  isMatchingPaystackBank,
  isPayoutsEnabled,
  isSupportedPaystackPayoutCurrency,
  isSupportedPaystackPayoutRoute,
  isValidNigerianAccountNumber,
  listBanks,
  resolveBankAccount,
  verifyTransfer,
  verifyTransferWebhookSignature,
} from '../lib/payouts';

// This suite exercises the seller/agent payout system's pure logic and its Paystack test-mode API
// wrappers against synthetic/mocked fetch responses only. It never touches a real database or a
// live/test Paystack network call, matching the pattern used by tests/paystack-synthetic.test.ts.

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
  return withEnv(vars, fn) as unknown as Promise<T>;
}

const TEST_SECRET_KEY = 'sk_test_synthetic_payout_secret';
const TEST_ENCRYPTION_KEY = 'a'.repeat(64);
const PAYOUTS_TEST_ENV = {
  PAYOUTS_ENABLED: 'true',
  PAYSTACK_SECRET_KEY: TEST_SECRET_KEY,
  PAYSTACK_WEBHOOK_SECRET: TEST_SECRET_KEY,
  PAYOUT_ACCOUNT_ENCRYPTION_KEY: TEST_ENCRYPTION_KEY,
  APP_URL: 'http://localhost:3000',
};

async function run(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`ok - ${name}`);
  } catch (error) {
    console.error(`not ok - ${name}`);
    throw error;
  }
}

async function main() {
  await run('payouts are disabled unless PAYOUTS_ENABLED=true, even with valid test credentials', async () => {
    withEnv({ ...PAYOUTS_TEST_ENV, PAYOUTS_ENABLED: undefined }, () => {
      assert.equal(isPayoutsEnabled(), false);
      assert.throws(() => assertPayoutsTestConfiguration(), /disabled/i);
    });
    withEnv({ ...PAYOUTS_TEST_ENV, PAYOUTS_ENABLED: 'false' }, () => {
      assert.equal(isPayoutsEnabled(), false);
    });
    assert.equal(arePayoutTransfersEnabled(), false);
  });

  await run('payout eligibility blocks unsettled, disputed, refunded, and refund-pending transactions', async () => {
    assert.match(getPayoutBlockReason({ transactionStatus: 'PENDING_PAYMENT', refunded: false, hasActiveDispute: false, hasActiveRefund: false }) ?? '', /not settled as paid/i);
    assert.match(getPayoutBlockReason({ transactionStatus: 'PAID', refunded: false, hasActiveDispute: true, hasActiveRefund: false }) ?? '', /open dispute/i);
    assert.match(getPayoutBlockReason({ transactionStatus: 'PAID', refunded: false, hasActiveDispute: false, hasActiveRefund: true }) ?? '', /refund/i);
    assert.match(getPayoutBlockReason({ transactionStatus: 'PAID', refunded: true, hasActiveDispute: false, hasActiveRefund: false }) ?? '', /refund/i);
    assert.equal(getPayoutBlockReason({ transactionStatus: 'PAID', refunded: false, hasActiveDispute: false, hasActiveRefund: false }), null);
  });

  await run('assertPayoutsTestConfiguration rejects a live secret key even when payouts are enabled', async () => {
    withEnv({ ...PAYOUTS_TEST_ENV, PAYSTACK_SECRET_KEY: 'sk_live_should_never_be_used' }, () => {
      assert.throws(() => assertPayoutsTestConfiguration(), /test mode/i);
    });
  });

  await run('assertPayoutsTestConfiguration rejects a malformed or missing encryption key', async () => {
    withEnv({ ...PAYOUTS_TEST_ENV, PAYOUT_ACCOUNT_ENCRYPTION_KEY: 'too-short' }, () => {
      assert.throws(() => assertPayoutsTestConfiguration(), /64-character hex/i);
    });
    withEnv({ ...PAYOUTS_TEST_ENV, PAYOUT_ACCOUNT_ENCRYPTION_KEY: undefined }, () => {
      assert.throws(() => assertPayoutsTestConfiguration(), /64-character hex/i);
    });
  });

  await run('assertPayoutsTestConfiguration passes with fully valid test-mode configuration', async () => {
    withEnv(PAYOUTS_TEST_ENV, () => {
      assert.doesNotThrow(() => assertPayoutsTestConfiguration());
    });
  });

  await run('computePayoutDueAt applies a 3-day holding period', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const dueAt = computePayoutDueAt(now);
    assert.equal(dueAt.getTime() - now.getTime(), 3 * 24 * 60 * 60 * 1000);
  });

  await run('payout retry policy enforces backoff and maximum attempts', async () => {
    const now = new Date('2026-01-01T00:00:00.000Z');
    const firstRetryAt = getPayoutRetryAt(1, now);
    assert.equal(firstRetryAt.getTime() - now.getTime(), 5 * 60_000);
    assert.equal(canRetryPayout(1, firstRetryAt, now), false);
    assert.equal(canRetryPayout(1, firstRetryAt, new Date(firstRetryAt.getTime() + 1)), true);
    assert.equal(canRetryPayout(5, null, new Date(firstRetryAt.getTime() + 1)), false);
  });

  await run('refund execution remains disabled and returns a non-success response', async () => {
    const response = await processRefundRequest();
    assert.equal(response.status, 503);
    const body = await response.json() as { error: string };
    assert.match(body.error, /refunds remain disabled/i);
  });

  await run('verified paid transaction creates one pending payout from the stored seller amount', async () => {
    const transaction: Record<string, unknown> = {
      id: 'transaction_synthetic_1',
      sellerId: 'seller_synthetic_1',
      status: FinancialTransactionStatus.PAID,
      currencyCode: 'NGN',
      amount: new Prisma.Decimal('6500000'),
      platformCommission: new Prisma.Decimal('130000'),
      buyerPlatformFee: new Prisma.Decimal('130000'),
      totalBuyerDue: new Prisma.Decimal('6630000'),
      sellerAmount: new Prisma.Decimal('6500000'),
      finalPayout: new Prisma.Decimal('6500000'),
      payoutDueAt: null,
    };
    const payoutsByTransaction = new Map<string, Record<string, unknown>>();
    let payoutCreateCalls = 0;
    const tx = {
      financialTransaction: {
        findUnique: async () => transaction,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          Object.assign(transaction, data);
          return transaction;
        },
      },
      payout: {
        findUnique: async () => payoutsByTransaction.get('transaction_synthetic_1') ?? null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          payoutCreateCalls += 1;
          const payout = { id: 'payout_synthetic_1', ...data };
          payoutsByTransaction.set('transaction_synthetic_1', payout);
          return payout;
        },
      },
      payoutAccount: { findUnique: async () => null },
      transactionDispute: { findFirst: async () => null },
      transactionRefund: { findFirst: async () => null },
      financialAuditLog: { create: async () => ({}) },
    } as unknown as Prisma.TransactionClient;

    const paidAt = new Date('2026-01-01T00:00:00.000Z');
    const first = await createPayoutRecordForPaidTransaction(tx, 'transaction_synthetic_1', paidAt);
    const duplicate = await createPayoutRecordForPaidTransaction(tx, 'transaction_synthetic_1', paidAt);
    const storedPayout = payoutsByTransaction.get('transaction_synthetic_1');
    assert.ok(storedPayout);
    assert.equal(first.outcome, 'created');
    assert.equal(duplicate.outcome, 'already_exists');
    assert.equal(payoutCreateCalls, 1);
    assert.equal(String(storedPayout.amount), '6500000');
    assert.equal(storedPayout.currencyCode, 'NGN');
    assert.equal(storedPayout.status, 'PENDING');
    assert.equal((transaction.payoutDueAt as Date).getTime(), computePayoutDueAt(paidAt).getTime());
  });

  await run('Paystack NUBAN transfers are restricted to supported Nigerian NGN payouts', async () => {
    assert.equal(isSupportedPaystackPayoutRoute('NG', 'NGN'), true);
    assert.equal(isSupportedPaystackPayoutCurrency('NGN'), true);
    assert.equal(isSupportedPaystackPayoutRoute('GB', 'GBP'), false);
    assert.equal(isSupportedPaystackPayoutRoute('NG', 'USD'), false);
    assert.equal(isSupportedPaystackPayoutCurrency('KES'), false);
    assert.equal(isValidNigerianAccountNumber('0123456789'), true);
    assert.equal(isValidNigerianAccountNumber('123456789'), false);
    assert.equal(isValidNigerianAccountNumber('01234567890'), false);
    const banks = [{ name: 'Guaranty Trust Bank', code: '058', currency: 'NGN' }];
    assert.equal(isMatchingPaystackBank(banks, '058', 'Guaranty Trust Bank'), true);
    assert.equal(isMatchingPaystackBank(banks, '058', 'Other Bank'), false);
    assert.equal(isMatchingPaystackBank(banks, '999', 'Guaranty Trust Bank'), false);
  });

  await run('bank account numbers round-trip through AES-256-GCM encryption without plaintext leakage', async () => {
    withEnv(PAYOUTS_TEST_ENV, () => {
      const plaintext = '0123456789';
      const cipherPayload = encryptAccountNumber(plaintext);
      assert.notEqual(cipherPayload, plaintext);
      assert.ok(!cipherPayload.includes(plaintext));
      const parts = cipherPayload.split(':');
      assert.equal(parts.length, 3);
      const decrypted = decryptAccountNumber(cipherPayload);
      assert.equal(decrypted, plaintext);
    });
  });

  await run('encryption round-trip fails closed if the payload is tampered with', async () => {
    withEnv(PAYOUTS_TEST_ENV, () => {
      const cipherPayload = encryptAccountNumber('9876543210');
      const [iv, authTag, ciphertext] = cipherPayload.split(':');
      const tampered = [iv, authTag, `${ciphertext.slice(0, -2)}xx`].join(':');
      assert.throws(() => decryptAccountNumber(tampered));
    });
  });

  await run('resolveBankAccount calls Paystack /bank/resolve and returns the resolved account name', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(({ url }) => {
        assert.ok(url.startsWith('https://api.paystack.co/bank/resolve'));
        assert.ok(url.includes('account_number=0123456789'));
        assert.ok(url.includes('bank_code=058'));
        return { status: 200, body: { status: true, message: 'ok', data: { account_number: '0123456789', account_name: 'Ada Synthetic Seller' } } };
      });
      try {
        const resolved = await resolveBankAccount({ accountNumber: '0123456789', bankCode: '058' });
        assert.equal(resolved.accountName, 'Ada Synthetic Seller');
      } finally {
        mock.restore();
      }
    });
  });

  await run('resolveBankAccount surfaces a Paystack failure message', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(() => ({ status: 422, body: { status: false, message: 'Could not resolve account name' } }));
      try {
        await assert.rejects(resolveBankAccount({ accountNumber: '0000000000', bankCode: '058' }), /Could not resolve account name/);
      } finally {
        mock.restore();
      }
    });
  });

  await run('listBanks parses a Paystack bank list response', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(() => ({
        status: 200,
        body: { status: true, message: 'ok', data: [{ name: 'Guaranty Trust Bank', code: '058', currency: 'NGN' }, { name: 'Not A Bank', slug: 'x' }] },
      }));
      try {
        const banks = await listBanks('nigeria');
        assert.equal(banks.length, 1);
        assert.deepEqual(banks[0], { name: 'Guaranty Trust Bank', code: '058', currency: 'NGN' });
      } finally {
        mock.restore();
      }
    });
  });

  await run('listBanks rejects countries outside its supported Nigerian payout route', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      await assert.rejects(listBanks('south africa'), /only for Nigeria/i);
    });
  });

  await run('createTransferRecipient posts to Paystack /transferrecipient and returns the recipient code', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(({ url, init }) => {
        assert.equal(url, 'https://api.paystack.co/transferrecipient');
        const payload = JSON.parse(String(init?.body));
        assert.equal(payload.type, 'nuban');
        assert.equal(payload.account_number, '0123456789');
        return { status: 200, body: { status: true, message: 'ok', data: { recipient_code: 'RCP_synthetic_1' } } };
      });
      try {
        const recipient = await createTransferRecipient({ name: 'Ada Synthetic Seller', accountNumber: '0123456789', bankCode: '058', currency: 'ngn' });
        assert.equal(recipient.recipientCode, 'RCP_synthetic_1');
      } finally {
        mock.restore();
      }
    });
  });

  await run('createTransferRecipient rejects unsupported payout currencies before calling Paystack', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(() => { throw new Error('fetch should not be called for an unsupported currency'); });
      try {
        await assert.rejects(
          createTransferRecipient({ name: 'Synthetic Seller', accountNumber: '0123456789', bankCode: '058', currency: 'USD' }),
          /not enabled for USD/i,
        );
      } finally {
        mock.restore();
      }
    });
  });

  await run('transfer initiation makes no Paystack call while payout execution is disabled', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(() => { throw new Error('fetch must not be called while payout execution is disabled'); });
      try {
        await assert.rejects(
          initiateTransfer({ amountMinor: 0, recipientCode: 'RCP_1', reference: 'PO-1-1', reason: 'test', currency: 'NGN' }),
          /execution is disabled/i,
        );
        await assert.rejects(
          initiateTransfer({ amountMinor: 1.5, recipientCode: 'RCP_1', reference: 'PO-1-1', reason: 'test', currency: 'NGN' }),
          /execution is disabled/i,
        );
        assert.equal(mock.calls.length, 0);
      } finally {
        mock.restore();
      }
    });
  });

  await run('payout execution remains disabled even with valid test configuration', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(() => { throw new Error('fetch must not be called while payout execution is disabled'); });
      try {
        await assert.rejects(
          initiateTransfer({ amountMinor: 663_000_000, recipientCode: 'RCP_1', reference: 'PO-1-1', reason: 'Seller payout test', currency: 'NGN' }),
          /execution is disabled/i,
        );
        assert.equal(mock.calls.length, 0);
      } finally {
        mock.restore();
      }
    });
  });

  await run('verifyTransfer reports a failed transfer with a failure reason', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(() => ({
        status: 200,
        body: { status: true, message: 'ok', data: { transfer_code: 'TRF_synthetic_2', id: 56, reference: 'PO-2-1', status: 'failed', failure_reason: 'Insufficient test balance' } },
      }));
      try {
        const verified = await verifyTransfer('TRF_synthetic_2');
        assert.equal(verified.status, 'failed');
        assert.equal(verified.failureReason, 'Insufficient test balance');
      } finally {
        mock.restore();
      }
    });
  });

  await run('verifyTransfer can reconcile an uncertain initiation by its stored idempotency reference', async () => {
    await withEnvAsync(PAYOUTS_TEST_ENV, async () => {
      const mock = installFetchMock(({ url }) => {
        assert.equal(url, 'https://api.paystack.co/transfer/verify/PO-payout_123-1');
        return {
          status: 200,
          body: { status: true, message: 'ok', data: { transfer_code: 'TRF_synthetic_3', id: 57, reference: 'PO-payout_123-1', status: 'pending' } },
        };
      });
      try {
        const verified = await verifyTransfer('PO-payout_123-1', true);
        assert.equal(verified.status, 'pending');
      } finally {
        mock.restore();
      }
    });
  });

  await run('verifyTransferWebhookSignature accepts a correctly signed payload and rejects a tampered one', async () => {
    const secret = TEST_SECRET_KEY;
    const rawBody = JSON.stringify({
      event: 'transfer.success',
      data: { transfer_code: 'TRF_synthetic_1', reference: 'PO-1-1', id: 55, amount: 650_000_000, currency: 'NGN' },
    });
    const signature = createHmac('sha512', secret).update(rawBody).digest('hex');
    assert.equal(verifyTransferWebhookSignature(rawBody, signature, secret), true);
    assert.equal(verifyTransferWebhookSignature(`${rawBody}tampered`, signature, secret), false);
    assert.equal(verifyTransferWebhookSignature(rawBody, 'not-a-valid-hex-signature', secret), false);
  });

  await run('isPaystackTransferEvent recognizes valid transfer events and rejects charge/unknown events', async () => {
    assert.equal(isPaystackTransferEvent({ event: 'transfer.success', data: { transfer_code: 'TRF_1', amount: 100, currency: 'NGN' } }), true);
    assert.equal(isPaystackTransferEvent({ event: 'transfer.failed', data: { reference: 'PO-1-1', amount: 100, currency: 'NGN' } }), true);
    assert.equal(isPaystackTransferEvent({ event: 'transfer.reversed', data: {} }), false);
    assert.equal(isPaystackTransferEvent({ event: 'charge.success', data: {} }), false);
    assert.equal(isPaystackTransferEvent({ event: 'transfer.success', data: null }), false);
    assert.equal(isPaystackTransferEvent(null), false);
    assert.equal(isPaystackTransferEvent('transfer.success'), false);
  });

  console.log('All payouts tests passed.');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
