import { createCipheriv, createDecipheriv, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { FinancialAuditAction, FinancialTransactionStatus, PayoutAccountStatus, PayoutStatus, Prisma } from '@prisma/client';
import { amountToMinorUnits, getApplicationUrl } from '@/lib/payments';
import { prisma } from '@/lib/prisma';
import { notifyUsersSafely } from '@/lib/notifications';

// Seller/agent payout system. This module is completely inert unless PAYOUTS_ENABLED='true'
// is explicitly set, and every Paystack call it makes still goes through the same sk_test_-only
// secret-key enforcement used by the checkout flow, so no live transfer or real money movement
// can occur even when the feature is turned on.

const PAYOUT_HOLD_PERIOD_MS = 3 * 24 * 60 * 60 * 1000; // 3-day holding period before a paid transaction becomes payout-eligible
const MAX_PAYOUT_ATTEMPTS = 5;
const RETRY_BACKOFF_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000, 12 * 60 * 60_000, 24 * 60 * 60_000]; // 5m, 30m, 2h, 12h, 24h
const RECONCILE_STALE_PROCESSING_MS = 15 * 60_000;

export function isPayoutsEnabled() {
  return process.env.PAYOUTS_ENABLED === 'true';
}

export function arePayoutTransfersEnabled() {
  return false;
}

export function isSupportedPaystackPayoutCurrency(currencyCode: string) {
  return currencyCode.toUpperCase() === 'NGN';
}

export function isSupportedPaystackPayoutRoute(countryCode: string, currencyCode: string) {
  return countryCode.toUpperCase() === 'NG' && isSupportedPaystackPayoutCurrency(currencyCode);
}

export function isValidNigerianAccountNumber(accountNumber: string) {
  return /^\d{10}$/.test(accountNumber);
}

export function getPayoutBlockReason(input: {
  transactionStatus: string;
  refunded: boolean;
  hasActiveDispute: boolean;
  hasActiveRefund: boolean;
}) {
  if (input.transactionStatus !== FinancialTransactionStatus.PAID) return 'The underlying transaction is not settled as paid.';
  if (input.refunded || input.hasActiveRefund) return 'A refund is pending or has been recorded.';
  if (input.hasActiveDispute) return 'The transaction has an open dispute.';
  return null;
}

export function isMatchingPaystackBank(
  banks: ListedBank[],
  bankCode: string,
  bankName: string,
) {
  return banks.some((bank) => bank.code === bankCode
    && bank.currency.toUpperCase() === 'NGN'
    && bank.name.trim().toLowerCase() === bankName.trim().toLowerCase());
}

export function computePayoutDueAt(now = new Date()) {
  return new Date(now.getTime() + PAYOUT_HOLD_PERIOD_MS);
}

export function getPayoutRetryAt(attemptNumber: number, now = new Date()) {
  const delay = RETRY_BACKOFF_MS[Math.min(Math.max(attemptNumber - 1, 0), RETRY_BACKOFF_MS.length - 1)];
  return new Date(now.getTime() + delay);
}

export function canRetryPayout(attempts: number, nextRetryAt: Date | null, now = new Date()) {
  return attempts < MAX_PAYOUT_ATTEMPTS && (!nextRetryAt || nextRetryAt.getTime() <= now.getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPaystackSecretKeyForPayouts() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Payouts are restricted to Paystack test mode. Configure a test secret key beginning with sk_test_.');
  }
  return secretKey;
}

function getPayoutEncryptionKey() {
  const key = process.env.PAYOUT_ACCOUNT_ENCRYPTION_KEY;
  if (!key || !/^[0-9a-f]{64}$/i.test(key)) {
    throw new Error('PAYOUT_ACCOUNT_ENCRYPTION_KEY must be a 64-character hex string (32 bytes) for AES-256-GCM.');
  }
  return Buffer.from(key, 'hex');
}

export function assertPayoutsTestConfiguration() {
  if (!isPayoutsEnabled()) {
    throw new Error('Seller payouts are disabled. Set PAYOUTS_ENABLED=true to enable this test-mode-only feature.');
  }
  getPaystackSecretKeyForPayouts();
  getPayoutEncryptionKey();
  getApplicationUrl();
}

export function encryptAccountNumber(accountNumber: string) {
  const key = getPayoutEncryptionKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(accountNumber, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString('base64'), authTag.toString('base64'), ciphertext.toString('base64')].join(':');
}

export function decryptAccountNumber(cipherPayload: string) {
  const key = getPayoutEncryptionKey();
  const [ivPart, authTagPart, ciphertextPart] = cipherPayload.split(':');
  if (!ivPart || !authTagPart || !ciphertextPart) throw new Error('Stored bank account payload is malformed.');
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64'));
  decipher.setAuthTag(Buffer.from(authTagPart, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextPart, 'base64')), decipher.final()]).toString('utf8');
}

async function readPaystackResponse(response: Response) {
  const result: unknown = await response.json();
  if (!isRecord(result)) throw new Error('Paystack returned an invalid API response.');
  if (!response.ok || result.status !== true) {
    const definitive = response.ok || (response.status >= 400 && response.status < 500);
    throw new PaystackApiError(typeof result.message === 'string' ? result.message : 'Paystack request failed.', definitive);
  }
  return result.data;
}

export class PaystackApiError extends Error {
  constructor(message: string, readonly definitive: boolean) {
    super(message);
    this.name = 'PaystackApiError';
  }
}

export interface ResolvedBankAccount {
  accountNumber: string;
  accountName: string;
}

export async function resolveBankAccount(input: { accountNumber: string; bankCode: string }): Promise<ResolvedBankAccount> {
  const secretKey = getPaystackSecretKeyForPayouts();
  const url = new URL('https://api.paystack.co/bank/resolve');
  url.searchParams.set('account_number', input.accountNumber);
  url.searchParams.set('bank_code', input.bankCode);
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
  const data = await readPaystackResponse(response);
  if (!isRecord(data) || typeof data.account_number !== 'string' || typeof data.account_name !== 'string') {
    throw new Error('Paystack did not return a resolved account name for this bank account.');
  }
  return { accountNumber: data.account_number, accountName: data.account_name };
}

export interface ListedBank {
  name: string;
  code: string;
  currency: string;
}

export async function listBanks(country: string): Promise<ListedBank[]> {
  if (country.toUpperCase() !== 'NG' && country.toLowerCase() !== 'nigeria') {
    throw new Error('Paystack bank payouts are currently supported only for Nigeria (NGN).');
  }
  const secretKey = getPaystackSecretKeyForPayouts();
  const url = new URL('https://api.paystack.co/bank');
  url.searchParams.set('country', 'nigeria');
  url.searchParams.set('currency', 'NGN');
  const response = await fetch(url, { headers: { Authorization: `Bearer ${secretKey}` } });
  const data = await readPaystackResponse(response);
  if (!Array.isArray(data)) throw new Error('Paystack did not return a bank list.');
  return data
    .filter((entry): entry is Record<string, unknown> => isRecord(entry) && typeof entry.name === 'string' && typeof entry.code === 'string')
    .map((entry) => ({ name: String(entry.name), code: String(entry.code), currency: typeof entry.currency === 'string' ? entry.currency : 'NGN' }));
}

export interface TransferRecipient {
  recipientCode: string;
}

export async function createTransferRecipient(input: {
  name: string;
  accountNumber: string;
  bankCode: string;
  currency: string;
}): Promise<TransferRecipient> {
  if (!isSupportedPaystackPayoutCurrency(input.currency)) {
    throw new Error(`Paystack transfers are not enabled for ${input.currency.toUpperCase()}.`);
  }
  const secretKey = getPaystackSecretKeyForPayouts();
  const response = await fetch('https://api.paystack.co/transferrecipient', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'nuban',
      name: input.name,
      account_number: input.accountNumber,
      bank_code: input.bankCode,
      currency: input.currency.toUpperCase(),
    }),
  });
  const data = await readPaystackResponse(response);
  if (!isRecord(data) || typeof data.recipient_code !== 'string') {
    throw new Error('Paystack did not return a transfer recipient code.');
  }
  return { recipientCode: data.recipient_code };
}

export type TransferResultStatus = 'success' | 'failed' | 'pending' | 'reversed';

export interface InitiatedTransfer {
  transferCode: string;
  processorTransferId: string;
  status: TransferResultStatus;
  reference: string;
  amountMinor?: number;
  currency?: string;
}

function normalizeTransferStatus(status: unknown): TransferResultStatus {
  if (status === 'success') return 'success';
  if (status === 'failed' || status === 'reversed') return status;
  return 'pending';
}

export async function initiateTransfer(input: {
  amountMinor: number;
  recipientCode: string;
  reference: string;
  reason: string;
  currency: string;
}): Promise<InitiatedTransfer> {
  if (!arePayoutTransfersEnabled()) {
    throw new Error('Payout transfer execution is disabled.');
  }
  if (!isSupportedPaystackPayoutCurrency(input.currency)) {
    throw new Error(`Paystack transfers are not enabled for ${input.currency.toUpperCase()}.`);
  }
  const secretKey = getPaystackSecretKeyForPayouts();
  if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
    throw new Error('Payout transfer requires a positive amount in currency minor units.');
  }
  const response = await fetch('https://api.paystack.co/transfer', {
    method: 'POST',
    headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'balance',
      amount: input.amountMinor,
      recipient: input.recipientCode,
      reference: input.reference,
      reason: input.reason,
      currency: input.currency.toUpperCase(),
    }),
  });
  const data = await readPaystackResponse(response);
  if (!isRecord(data) || typeof data.transfer_code !== 'string'
    || (typeof data.id !== 'number' && typeof data.id !== 'string') || typeof data.reference !== 'string') {
    throw new Error('Paystack did not return a valid transfer response.');
  }
  return {
    transferCode: data.transfer_code,
    processorTransferId: String(data.id),
    status: normalizeTransferStatus(data.status),
    reference: data.reference,
    ...(typeof data.amount === 'number' ? { amountMinor: data.amount } : {}),
    ...(typeof data.currency === 'string' ? { currency: data.currency.toUpperCase() } : {}),
  };
}

export async function verifyTransfer(
  transferCodeOrId: string,
  byReference = false,
): Promise<InitiatedTransfer & { failureReason: string | null }> {
  const secretKey = getPaystackSecretKeyForPayouts();
  const endpoint = byReference ? 'transfer/verify' : 'transfer';
  const response = await fetch(`https://api.paystack.co/${endpoint}/${encodeURIComponent(transferCodeOrId)}`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  const data = await readPaystackResponse(response);
  if (!isRecord(data) || typeof data.transfer_code !== 'string'
    || (typeof data.id !== 'number' && typeof data.id !== 'string') || typeof data.reference !== 'string') {
    throw new Error('Paystack did not return a valid transfer verification response.');
  }
  return {
    transferCode: data.transfer_code,
    processorTransferId: String(data.id),
    status: normalizeTransferStatus(data.status),
    reference: data.reference,
    ...(typeof data.amount === 'number' ? { amountMinor: data.amount } : {}),
    ...(typeof data.currency === 'string' ? { currency: data.currency.toUpperCase() } : {}),
    failureReason: typeof data.failure_reason === 'string' ? data.failure_reason : null,
  };
}

export function getPayoutTransferWebhookSecret() {
  // Paystack signs transfer webhooks with the same secret key as charge webhooks.
  const secretKey = getPaystackSecretKeyForPayouts();
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!webhookSecret || webhookSecret !== secretKey) {
    throw new Error('PAYSTACK_WEBHOOK_SECRET must match the Paystack test secret key used to sign Paystack webhooks.');
  }
  return webhookSecret;
}

export function verifyTransferWebhookSignature(rawBody: string, signature: string, secret: string) {
  if (!/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

/**
 * Marks a paid transaction as payout-eligible after a short holding period. Idempotent: it only
 * ever sets payoutDueAt/payoutStatus on transactions that are still NOT_DUE.
 */
export async function schedulePayoutEligibility(transactionId: string, now = new Date()) {
  await prisma.financialTransaction.updateMany({
    where: { id: transactionId, status: FinancialTransactionStatus.PAID, payoutStatus: PayoutStatus.NOT_DUE },
    data: { payoutStatus: PayoutStatus.PENDING, payoutDueAt: computePayoutDueAt(now) },
  });
}

async function getTransactionPayoutHoldReason(tx: Prisma.TransactionClient, transactionId: string) {
  const [transaction, activeDispute, activeRefund] = await Promise.all([
    tx.financialTransaction.findUnique({
      where: { id: transactionId },
      select: { status: true, refundedAt: true },
    }),
    tx.transactionDispute.findFirst({
      where: { transactionId, status: { in: ['OPEN', 'UNDER_REVIEW'] } },
      select: { id: true },
    }),
    tx.transactionRefund.findFirst({
      where: { transactionId, status: { in: ['PENDING', 'PAID', 'REFUNDED'] } },
      select: { id: true },
    }),
  ]);
  return getPayoutBlockReason({
    transactionStatus: transaction?.status ?? '',
    refunded: Boolean(transaction?.refundedAt),
    hasActiveDispute: Boolean(activeDispute),
    hasActiveRefund: Boolean(activeRefund),
  });
}

export async function createPayoutRecordForPaidTransaction(
  tx: Prisma.TransactionClient,
  transactionId: string,
  paidAt = new Date(),
) {
  const transaction = await tx.financialTransaction.findUnique({ where: { id: transactionId } });
  if (!transaction || transaction.status !== FinancialTransactionStatus.PAID) {
    return { outcome: 'not_eligible' as const };
  }
  const holdReason = await getTransactionPayoutHoldReason(tx, transactionId);
  if (holdReason) return { outcome: 'not_eligible' as const, reason: holdReason };

  const existing = await tx.payout.findUnique({ where: { transactionId } });
  if (existing) return { outcome: 'already_exists' as const, payoutId: existing.id };

  const supported = isSupportedPaystackPayoutCurrency(transaction.currencyCode);
  const payoutAccount = supported
    ? await tx.payoutAccount.findUnique({ where: { userId: transaction.sellerId } })
    : null;
  const matchingAccount = payoutAccount
    && payoutAccount.status === PayoutAccountStatus.VERIFIED
    && payoutAccount.provider === 'PAYSTACK'
    && payoutAccount.currencyCode === transaction.currencyCode
    && payoutAccount.recipientCode
    ? payoutAccount
    : null;
  const status = supported ? PayoutStatus.PENDING : PayoutStatus.HELD;
  const payoutDueAt = transaction.payoutDueAt ?? computePayoutDueAt(paidAt);
  const payout = await tx.payout.create({
    data: {
      transactionId,
      recipientId: transaction.sellerId,
      payoutAccountId: matchingAccount?.id ?? null,
      amount: transaction.finalPayout,
      currencyCode: transaction.currencyCode,
      status,
      provider: 'PAYSTACK',
      failureReason: supported
        ? null
        : `Paystack transfers are not enabled for ${transaction.currencyCode}; payout requires an alternate supported provider.`,
    },
  });
  await tx.financialTransaction.update({
    where: { id: transactionId },
    data: { payoutStatus: status, payoutDueAt },
  });
  await tx.financialAuditLog.create({
    data: {
      action: FinancialAuditAction.PAYOUT_UPDATED,
      entityType: 'Payout',
      entityId: payout.id,
      before: Prisma.JsonNull,
      after: {
        status,
        amount: transaction.finalPayout.toString(),
        currencyCode: transaction.currencyCode,
        payoutDueAt: payoutDueAt.toISOString(),
        payoutAccountId: matchingAccount?.id ?? null,
      },
      reason: supported
        ? 'Pending seller payout created atomically after verified payment using the server-recorded final payout amount; transfer remains subject to the holding period and admin approval.'
        : `Seller payout held because Paystack transfers are not enabled for ${transaction.currencyCode}.`,
    },
  });
  return { outcome: status === PayoutStatus.PENDING ? 'created' as const : 'held_unsupported_currency' as const, payoutId: payout.id };
}

interface CreatePayoutOutcome {
  outcome: 'created' | 'already_exists' | 'not_eligible' | 'held_unsupported_currency' | 'disabled';
  payoutId?: string;
  reason?: string;
}

/**
 * Creates a Payout row for a single eligible transaction using ONLY the server-recorded
 * finalPayout amount and currency from the FinancialTransaction — never a client-supplied value.
 */
export async function createPayoutForTransaction(transactionId: string): Promise<CreatePayoutOutcome> {
  if (!isPayoutsEnabled()) return { outcome: 'disabled' };

  return prisma.$transaction(async (tx) => {
    const transaction = await tx.financialTransaction.findUnique({ where: { id: transactionId } });
    if (!transaction || transaction.status !== FinancialTransactionStatus.PAID) return { outcome: 'not_eligible' };
    if (transaction.payoutDueAt && transaction.payoutDueAt.getTime() > Date.now()) return { outcome: 'not_eligible' };
    const existingPayout = await tx.payout.findUnique({ where: { transactionId } });
    if (existingPayout) return { outcome: 'already_exists', payoutId: existingPayout.id };
    return createPayoutRecordForPaidTransaction(tx, transactionId);
  });
}

/**
 * One-time/administrator-triggered backfill: marks already-PAID transactions that predate payouts
 * being enabled (still NOT_DUE) as payout-eligible after the holding period. Idempotent per row.
 */
export async function backfillPayoutEligibility(limit = 200) {
  if (!isPayoutsEnabled()) return { updated: 0, disabled: true as const };
  const candidates = await prisma.financialTransaction.findMany({
    where: { status: FinancialTransactionStatus.PAID, payoutStatus: PayoutStatus.NOT_DUE },
    select: { id: true },
    take: limit,
  });
  await Promise.all(candidates.map((transaction) => schedulePayoutEligibility(transaction.id)));
  return { updated: candidates.length, disabled: false as const };
}

/**
 * Scans PAID transactions whose holding period has elapsed and creates Payout rows for the ones
 * that don't have one yet. Safe to call repeatedly (fully idempotent).
 */
export async function createEligiblePayouts(limit = 50) {
  if (!isPayoutsEnabled()) return { processed: 0, disabled: true as const };
  const due = await prisma.financialTransaction.findMany({
    where: {
      status: FinancialTransactionStatus.PAID,
      payoutStatus: PayoutStatus.PENDING,
      payoutDueAt: { lte: new Date() },
      payouts: { none: {} },
    },
    select: { id: true },
    take: limit,
  });
  const results = await Promise.all(due.map((transaction) => createPayoutForTransaction(transaction.id)));
  return { processed: results.length, disabled: false as const, results };
}

export async function approvePayout(payoutId: string, adminId: string, reason: string) {
  assertPayoutsTestConfiguration();
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({
      where: { id: payoutId },
      include: {
        transaction: { select: { id: true, sellerId: true, status: true, payoutDueAt: true, finalPayout: true, currencyCode: true } },
        payoutAccount: true,
      },
    });
    if (!payout) return { outcome: 'not_found' as const };
    if (payout.status !== PayoutStatus.PENDING || payout.approvedAt) return { outcome: 'not_approvable' as const };
    await tx.$queryRaw`SELECT "id" FROM "FinancialTransaction" WHERE "id" = ${payout.transaction.id} FOR UPDATE`;
    const transaction = await tx.financialTransaction.findUnique({
      where: { id: payout.transaction.id },
      select: { id: true, sellerId: true, status: true, payoutDueAt: true, finalPayout: true, currencyCode: true },
    });
    if (!transaction || transaction.status !== FinancialTransactionStatus.PAID) return { outcome: 'transaction_not_paid' as const };
    if (payout.recipientId !== transaction.sellerId
      || !payout.amount.equals(transaction.finalPayout)
      || payout.currencyCode !== transaction.currencyCode) {
      return { outcome: 'payout_data_mismatch' as const };
    }
    const holdReason = await getTransactionPayoutHoldReason(tx, transaction.id);
    if (holdReason) return { outcome: 'transaction_on_hold' as const, reason: holdReason };
    if (transaction.payoutDueAt && transaction.payoutDueAt.getTime() > Date.now()) {
      return { outcome: 'holding_period' as const };
    }
    if (!isSupportedPaystackPayoutCurrency(payout.currencyCode)) return { outcome: 'unsupported_currency' as const };
    if (!payout.payoutAccount || payout.payoutAccount.status !== PayoutAccountStatus.VERIFIED
      || payout.payoutAccount.provider !== 'PAYSTACK'
      || payout.payoutAccount.currencyCode !== payout.currencyCode
      || payout.payoutAccount.userId !== payout.recipientId
      || !payout.payoutAccount.recipientCode) {
      return { outcome: 'verified_account_required' as const };
    }

    const approvedAt = new Date();
    const updated = await tx.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.PENDING, approvedAt: null },
      data: { approvedAt, approvedById: adminId },
    });
    if (updated.count !== 1) return { outcome: 'not_approvable' as const };
    await tx.financialAuditLog.create({
      data: {
        actorId: adminId,
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: PayoutStatus.PENDING, approvedAt: null },
        after: { status: PayoutStatus.PENDING, approvedAt: approvedAt.toISOString(), approvedById: adminId },
        reason,
      },
    });
    return { outcome: 'approved' as const, approvedAt };
  });
}

interface InitiateOutcome {
  outcome: 'initiated' | 'failed' | 'unknown' | 'already_processing' | 'not_ready' | 'disabled' | 'max_attempts_reached';
}

/**
 * Initiates (or retries) the Paystack test-mode transfer for a single Payout row, using only the
 * amount already stored on the Payout (itself sourced from the server-recorded finalPayout).
 */
export async function initiatePayoutTransfer(payoutId: string): Promise<InitiateOutcome> {
  if (!arePayoutTransfersEnabled()) return { outcome: 'disabled' };
  assertPayoutsTestConfiguration();

  const payout = await prisma.payout.findUnique({
    where: { id: payoutId },
    include: {
      payoutAccount: true,
      currency: { select: { minorUnits: true } },
      transaction: { select: { id: true, status: true, payoutDueAt: true } },
    },
  });
  if (!payout || !payout.payoutAccount?.recipientCode || payout.payoutAccount.status !== PayoutAccountStatus.VERIFIED
    || payout.payoutAccount.provider !== 'PAYSTACK' || payout.payoutAccount.currencyCode !== payout.currencyCode) {
    return { outcome: 'not_ready' };
  }
  if (!isSupportedPaystackPayoutCurrency(payout.currencyCode) || !payout.approvedAt) return { outcome: 'not_ready' };
  if (payout.transaction.payoutDueAt && payout.transaction.payoutDueAt.getTime() > Date.now()) return { outcome: 'not_ready' };
  if (payout.status === PayoutStatus.PAID) return { outcome: 'already_processing' };
  if (payout.status === PayoutStatus.PROCESSING) return { outcome: 'already_processing' };
  if (payout.status === PayoutStatus.FAILED && payout.attempts >= MAX_PAYOUT_ATTEMPTS) return { outcome: 'max_attempts_reached' };
  if (payout.status === PayoutStatus.FAILED && payout.nextRetryAt && payout.nextRetryAt.getTime() > Date.now()) {
    return { outcome: 'not_ready' };
  }
  if (payout.status !== PayoutStatus.PENDING && payout.status !== PayoutStatus.FAILED) return { outcome: 'not_ready' };
  if (payout.transaction.status !== FinancialTransactionStatus.PAID) {
    // The underlying transaction is no longer in a settled-paid state (e.g. a dispute or refund
    // was recorded after this payout was created). Hold it instead of transferring money out.
    await prisma.payout.updateMany({ where: { id: payoutId, status: payout.status }, data: { status: PayoutStatus.HELD } });
    await prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: payout.status },
        after: { status: PayoutStatus.HELD, reason: `Transaction status is ${payout.transaction.status}, not PAID.` },
        reason: 'Payout automatically held because the underlying transaction is disputed, refunded, or otherwise no longer settled as paid.',
      },
    });
    return { outcome: 'not_ready' };
  }

  const attemptNumber = payout.attempts + 1;
  const reference = `PO-${payout.id}-${attemptNumber}`;
  const claimed = await prisma.payout.updateMany({
    where: { id: payoutId, status: payout.status },
    data: {
      status: PayoutStatus.PROCESSING,
      attempts: attemptNumber,
      lastAttemptAt: new Date(),
      nextRetryAt: null,
      providerReference: reference,
      transferCode: null,
      processorTransferId: null,
    },
  });
  if (claimed.count !== 1) return { outcome: 'already_processing' };

  const transactionClaim = await prisma.financialTransaction.updateMany({
    where: {
      id: payout.transactionId,
      status: FinancialTransactionStatus.PAID,
      payoutStatus: { in: [PayoutStatus.PENDING, PayoutStatus.FAILED] },
    },
    data: { payoutStatus: PayoutStatus.PROCESSING },
  });
  if (transactionClaim.count !== 1) {
    await prisma.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.PROCESSING, providerReference: reference },
      data: { status: PayoutStatus.HELD },
    });
    await prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: PayoutStatus.PROCESSING },
        after: { status: PayoutStatus.HELD, reason: 'Transaction changed before the transfer could be initiated.' },
        reason: 'Payout was held because the paid transaction could not be atomically claimed before transfer initiation.',
      },
    });
    return { outcome: 'not_ready' };
  }

  try {
    const transfer = await initiateTransfer({
      amountMinor: amountToMinorUnits(payout.amount.toString(), payout.currency.minorUnits),
      recipientCode: payout.payoutAccount.recipientCode,
      reference,
      reason: `Seller payout for transaction ${payout.transactionId} (test mode).`,
      currency: payout.currencyCode,
    });
    await prisma.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.PROCESSING, providerReference: reference },
      data: {
        transferCode: transfer.transferCode,
        processorTransferId: transfer.processorTransferId,
      },
    });
    if (transfer.reference !== reference) {
      throw new Error('Paystack returned a transfer reference different from the stored payout reference.');
    }
    await prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: 'PENDING_OR_FAILED' },
        after: { status: PayoutStatus.PROCESSING, transferCode: transfer.transferCode, reference },
        reason: `Paystack test-mode transfer initiated (attempt ${attemptNumber}).`,
      },
    });
    if (transfer.status === 'success') {
      await settlePayoutOutcome({
        providerReference: reference,
        transferCode: transfer.transferCode,
        processorTransferId: transfer.processorTransferId,
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
        status: 'success',
        failureReason: null,
      });
    } else if (transfer.status === 'failed' || transfer.status === 'reversed') {
      await settlePayoutOutcome({
        providerReference: reference,
        transferCode: transfer.transferCode,
        processorTransferId: transfer.processorTransferId,
        amountMinor: transfer.amountMinor,
        currency: transfer.currency,
        status: 'failed',
        failureReason: 'Paystack reported an immediate transfer failure.',
      });
    }
    return { outcome: 'initiated' };
  } catch (error) {
    const failureReason = error instanceof Error ? error.message : 'Unknown transfer initiation failure.';
    if (error instanceof PaystackApiError && error.definitive) {
      await settlePayoutOutcome({
        providerReference: reference,
        status: 'failed',
        failureReason,
      });
      return { outcome: 'failed' };
    }
    await prisma.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: PayoutStatus.PROCESSING },
        after: { status: PayoutStatus.PROCESSING, failureReason, providerReference: reference },
        reason: `Paystack test-mode transfer initiation returned an uncertain result (attempt ${attemptNumber}); payout remains processing to prevent a duplicate transfer and requires reconciliation.`,
      },
    });
    return { outcome: 'unknown' };
  }
}

interface TransferOutcomeInput {
  providerReference?: string | null;
  transferCode?: string | null;
  processorTransferId?: string | null;
  amountMinor?: number;
  currency?: string;
  status: 'success' | 'failed';
  reversed?: boolean;
  failureReason: string | null;
}

/**
 * Settles a Payout based on a verified transfer outcome (from a signature-verified webhook or
 * reconciliation poll). Idempotent: only transitions a PROCESSING payout, and only once.
 */
async function settlePayoutOutcomeInTransaction(tx: Prisma.TransactionClient, input: TransferOutcomeInput) {
  const identifierClauses: Prisma.PayoutWhereInput[] = [];
  if (input.transferCode) identifierClauses.push({ transferCode: input.transferCode });
  if (input.processorTransferId) identifierClauses.push({ processorTransferId: input.processorTransferId });
  if (input.providerReference) identifierClauses.push({ providerReference: input.providerReference });
  if (identifierClauses.length === 0) return { outcome: 'payout_not_found' as const };
  const payout = await tx.payout.findFirst({
    where: { OR: identifierClauses },
    include: { currency: { select: { minorUnits: true } } },
  });
  if (!payout) return { outcome: 'payout_not_found' as const };
  if (payout.provider !== 'PAYSTACK'
    || (input.providerReference && payout.providerReference !== input.providerReference)) {
    return { outcome: 'reference_mismatch' as const };
  }
  if (input.status === 'success'
    && (input.amountMinor === undefined
      || input.currency === undefined
      || !input.providerReference
      || input.transferCode === undefined && input.processorTransferId === undefined)) {
    await tx.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payout.id,
        before: { status: payout.status },
        after: { status: payout.status, rejectedEvent: 'incomplete_success_verification' },
        reason: 'Paystack success was not applied because the transfer outcome lacked complete reconciliation identifiers or financial values.',
      },
    });
    return { outcome: 'incomplete_verification' as const };
  }
  if (input.amountMinor !== undefined
    && input.amountMinor !== amountToMinorUnits(payout.amount.toString(), payout.currency.minorUnits)) {
    await tx.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payout.id,
        before: { status: payout.status },
        after: { status: payout.status, rejectedEvent: 'amount_mismatch' },
        reason: 'Paystack transfer outcome was not applied because its amount did not match the server-stored payout.',
      },
    });
    return { outcome: 'amount_mismatch' as const };
  }
  if (input.currency !== undefined && input.currency.toUpperCase() !== payout.currencyCode) {
    await tx.financialAuditLog.create({
      data: {
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payout.id,
        before: { status: payout.status },
        after: { status: payout.status, rejectedEvent: 'currency_mismatch' },
        reason: 'Paystack transfer outcome was not applied because its currency did not match the server-stored payout.',
      },
    });
    return { outcome: 'currency_mismatch' as const };
  }
  if (payout.status === PayoutStatus.PAID && !input.reversed
    || payout.status === PayoutStatus.FAILED && input.status === 'failed' && !input.reversed) {
    return { outcome: 'already_settled' as const };
  }
  if (payout.status !== PayoutStatus.PROCESSING && !(payout.status === PayoutStatus.PAID && input.reversed)) {
    return { outcome: 'not_processing' as const };
  }

  const newStatus = input.status === 'success' ? PayoutStatus.PAID : PayoutStatus.FAILED;
  const previousStatus = payout.status;
  const claimed = await tx.payout.updateMany({
    where: { id: payout.id, status: previousStatus },
    data: {
      status: newStatus,
      failureReason: input.status === 'failed' ? input.failureReason : null,
      completedAt: input.status === 'success' ? new Date() : null,
      nextRetryAt: input.status === 'failed'
        ? getPayoutRetryAt(payout.attempts)
        : null,
    },
  });
  if (claimed.count !== 1) return { outcome: 'already_settled' as const };

  await tx.financialTransaction.updateMany({
    where: { id: payout.transactionId },
    data: { payoutStatus: newStatus },
  });
  await tx.financialAuditLog.create({
    data: {
      action: FinancialAuditAction.PAYOUT_UPDATED,
      entityType: 'Payout',
      entityId: payout.id,
      before: { status: previousStatus },
      after: { status: newStatus, failureReason: input.failureReason },
      reason: `Paystack test-mode transfer ${input.status === 'success' ? 'succeeded' : 'failed'} (verified).`,
    },
  });
  return { outcome: 'settled' as const, status: newStatus };
}

export async function settlePayoutOutcome(input: TransferOutcomeInput) {
  return prisma.$transaction((tx) => settlePayoutOutcomeInTransaction(tx, input));
}

export interface PaystackTransferWebhookEvent {
  event: 'transfer.success' | 'transfer.failed' | 'transfer.reversed';
  data: {
    transfer_code?: string;
    reference?: string;
    id?: number | string;
    amount: number;
    currency: string;
    reason?: string;
  };
}

export function isPaystackTransferEvent(value: unknown): value is PaystackTransferWebhookEvent {
  if (!isRecord(value) || typeof value.event !== 'string') return false;
  if (value.event !== 'transfer.success' && value.event !== 'transfer.failed' && value.event !== 'transfer.reversed') return false;
  if (!isRecord(value.data)) return false;
  const hasIdentifier = (typeof value.data.transfer_code === 'string' && value.data.transfer_code.length > 0)
    || (typeof value.data.reference === 'string' && value.data.reference.length > 0)
    || (typeof value.data.id === 'string' && value.data.id.length > 0)
    || (typeof value.data.id === 'number' && Number.isSafeInteger(value.data.id));
  return hasIdentifier && typeof value.data.amount === 'number' && Number.isSafeInteger(value.data.amount)
    && value.data.amount >= 0 && typeof value.data.currency === 'string' && /^[A-Z]{3}$/i.test(value.data.currency);
}

/**
 * Processes a signature-verified Paystack transfer webhook idempotently (dedup key includes the
 * transfer code/reference and event type, using the same PaymentWebhookEvent ledger as checkout).
 */
export async function processTransferWebhookEvent(event: PaystackTransferWebhookEvent) {
  if (!isPayoutsEnabled()) return { duplicate: false, outcome: 'disabled' as const };
  const dedupeKey = event.data.transfer_code || event.data.reference || String(event.data.id ?? '');
  if (!dedupeKey) return { duplicate: false, outcome: 'invalid_event' as const };
  const eventId = `PAYSTACK_TRANSFER:${dedupeKey}:${event.event}`;
  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.paymentWebhookEvent.create({ data: { eventId, eventType: event.event, outcome: 'processing' } });
      const outcome = await settlePayoutOutcomeInTransaction(tx, {
        transferCode: event.data.transfer_code ?? null,
        processorTransferId: event.data.id !== undefined ? String(event.data.id) : null,
        providerReference: event.data.reference ?? null,
        amountMinor: event.data.amount,
        currency: event.data.currency,
        status: event.event === 'transfer.success' ? 'success' : 'failed',
        reversed: event.event === 'transfer.reversed',
        failureReason: event.event === 'transfer.success' ? null : (event.data.reason ?? `Paystack reported ${event.event}.`),
      });
      await tx.paymentWebhookEvent.updateMany({ where: { eventId }, data: { outcome: outcome.outcome, processedAt: new Date() } });
      return outcome;
    }, { maxWait: 10_000, timeout: 20_000 });
    if (result.outcome === 'settled') {
      const identifiers: Prisma.PayoutWhereInput[] = [];
      if (event.data.transfer_code) identifiers.push({ transferCode: event.data.transfer_code });
      if (event.data.id !== undefined) identifiers.push({ processorTransferId: String(event.data.id) });
      if (event.data.reference) identifiers.push({ providerReference: event.data.reference });
      const payout = identifiers.length
        ? await prisma.payout.findFirst({
          where: { OR: identifiers },
          select: { id: true, recipientId: true, transactionId: true, status: true },
        }).catch((error) => {
          console.error('Could not find payout notification recipient:', error);
          return null;
        })
        : null;
      if (payout) {
        await notifyUsersSafely({
          userIds: [payout.recipientId],
          type: 'PAYMENT',
          message: payout.status === PayoutStatus.PAID
            ? 'Your payout transfer was confirmed.'
            : 'Your payout transfer failed or was reversed. Check the payout dashboard for the latest status.',
          eventName: 'notification',
          eventData: { payoutId: payout.id, transactionId: payout.transactionId, status: payout.status },
        });
      }
    }
    return { duplicate: false, outcome: result.outcome };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { duplicate: true, outcome: 'duplicate' as const };
    }
    throw error;
  }
}

/**
 * Reconciles a stuck PROCESSING payout by polling Paystack's transfer-verification API directly,
 * for cases where a webhook delivery was missed or delayed.
 */
export async function reconcilePayout(payoutId: string) {
  assertPayoutsTestConfiguration();
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) return { outcome: 'not_found' as const };
  if (payout.status !== PayoutStatus.PROCESSING) return { outcome: 'not_processing' as const };
  if (Date.now() - (payout.lastAttemptAt?.getTime() ?? 0) < RECONCILE_STALE_PROCESSING_MS) {
    return { outcome: 'too_recent' as const };
  }
  const identifier = payout.transferCode ?? payout.processorTransferId ?? payout.providerReference;
  if (!identifier) return { outcome: 'no_transfer_reference' as const };
  const verified = await verifyTransfer(identifier, !payout.transferCode && !payout.processorTransferId);
  if (payout.providerReference && verified.reference !== payout.providerReference) {
    return { outcome: 'reference_mismatch' as const };
  }
  if (verified.status === 'pending') return { outcome: 'still_pending' as const };
  const settled = await settlePayoutOutcome({
    transferCode: verified.transferCode,
    processorTransferId: verified.processorTransferId,
    providerReference: verified.reference,
    amountMinor: verified.amountMinor,
    currency: verified.currency,
    status: verified.status === 'success' ? 'success' : 'failed',
    reversed: verified.status === 'reversed',
    failureReason: verified.status === 'success' ? null : (verified.failureReason ?? 'Paystack reconciliation reported a failed transfer.'),
  });
  return { outcome: 'reconciled' as const, settled };
}

/**
 * Resets a FAILED payout back to PENDING so the next scheduler/admin run can retry it, respecting
 * the maximum attempt count.
 */
export async function retryFailedPayout(payoutId: string, adminId: string) {
  assertPayoutsTestConfiguration();
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({
      where: { id: payoutId },
      include: { transaction: { select: { id: true, status: true } } },
    });
    if (!payout) return { outcome: 'not_found' as const };
    if (payout.status !== PayoutStatus.FAILED) return { outcome: 'not_failed' as const };
    if (payout.attempts >= MAX_PAYOUT_ATTEMPTS) return { outcome: 'max_attempts_reached' as const };
    if (!canRetryPayout(payout.attempts, payout.nextRetryAt)) return { outcome: 'retry_backoff' as const };
    if (payout.transaction.status !== FinancialTransactionStatus.PAID) return { outcome: 'transaction_not_paid' as const };
    const holdReason = await getTransactionPayoutHoldReason(tx, payout.transaction.id);
    if (holdReason) return { outcome: 'transaction_on_hold' as const, reason: holdReason };
    const claimed = await tx.payout.updateMany({
      where: { id: payoutId, status: PayoutStatus.FAILED },
      data: {
        status: PayoutStatus.PENDING,
        nextRetryAt: null,
        approvedAt: null,
        approvedById: null,
      },
    });
    if (claimed.count !== 1) return { outcome: 'not_failed' as const };
    await tx.financialTransaction.updateMany({
      where: { id: payout.transactionId, status: FinancialTransactionStatus.PAID },
      data: { payoutStatus: PayoutStatus.PENDING },
    });
    await tx.financialAuditLog.create({
      data: {
        actorId: adminId,
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: PayoutStatus.FAILED },
        after: { status: PayoutStatus.PENDING, approvedAt: null },
        reason: 'Administrator reset the failed payout for retry; it requires review and approval before another transfer attempt.',
      },
    });
    return { outcome: 'reset' as const };
  });
}

/**
 * Admin action to hold or release a payout, e.g. while investigating a dispute.
 */
export async function setPayoutHold(payoutId: string, held: boolean, reason: string, adminId: string) {
  return prisma.$transaction(async (tx) => {
    const payout = await tx.payout.findUnique({ where: { id: payoutId } });
    if (!payout) return { outcome: 'not_found' as const };
    if (held && payout.status !== PayoutStatus.PENDING && payout.status !== PayoutStatus.FAILED) return { outcome: 'not_holdable' as const };
    if (!held && payout.status !== PayoutStatus.HELD) return { outcome: 'not_held' as const };
    if (!held) {
      await tx.$queryRaw`SELECT "id" FROM "FinancialTransaction" WHERE "id" = ${payout.transactionId} FOR UPDATE`;
      const holdReason = await getTransactionPayoutHoldReason(tx, payout.transactionId);
      if (holdReason) return { outcome: 'transaction_on_hold' as const, reason: holdReason };
      if (!isSupportedPaystackPayoutCurrency(payout.currencyCode)) return { outcome: 'unsupported_currency' as const };
    }
    const newStatus = held ? PayoutStatus.HELD : PayoutStatus.PENDING;
    const updated = await tx.payout.updateMany({
      where: { id: payoutId, status: payout.status },
      data: { status: newStatus, approvedAt: null, approvedById: null },
    });
    if (updated.count !== 1) return { outcome: 'not_holdable' as const };
    await tx.financialTransaction.updateMany({
      where: { id: payout.transactionId, status: FinancialTransactionStatus.PAID },
      data: { payoutStatus: newStatus },
    });
    await tx.financialAuditLog.create({
      data: {
        actorId: adminId,
        action: FinancialAuditAction.PAYOUT_UPDATED,
        entityType: 'Payout',
        entityId: payoutId,
        before: { status: payout.status, approvedAt: payout.approvedAt?.toISOString() ?? null },
        after: { status: newStatus, approvedAt: null },
        reason,
      },
    });
    return { outcome: 'updated' as const };
  });
}
