import { createHmac, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';

export type PaymentResultStatus = 'success' | 'failed' | 'abandoned';

export interface VerifiedPayment {
  reference: string;
  transactionId: string;
  status: PaymentResultStatus;
  amountMinor: number;
  currency: string;
  paidAt: Date | null;
}

export interface PaymentInitialization {
  authorizationUrl: string;
  reference: string;
}

export interface PaymentProvider {
  readonly code: string;
  supports(currencyCode: string, countryCode?: string | null): boolean;
  initialize(input: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    purchaseType: 'TRANSACTION' | 'SUBSCRIPTION' | 'FEATURED_LISTING';
  }): Promise<PaymentInitialization>;
  verify(reference: string): Promise<VerifiedPayment>;
}

const paystackCurrencies = new Set(['NGN', 'GHS', 'KES', 'ZAR', 'XOF', 'USD']);
const checkoutBodySchema = z.object({}).strict();
const currencyCodePattern = /^[A-Z]{3}$/;

export class UnsupportedPaymentProviderError extends Error {}

export function isLocalMockPaymentsEnabled() {
  return process.env.NODE_ENV !== 'production'
    && process.env.PAYMENT_PROVIDER === 'MOCK'
    && process.env.MOCK_PAYMENTS_ENABLED === 'true';
}

export function getLocalMockDatabaseUrl() {
  if (!isLocalMockPaymentsEnabled()) throw new Error('Local mock payments are disabled.');
  const databaseUrl = process.env.MOCK_DATABASE_URL;
  if (!databaseUrl) throw new Error('MOCK_DATABASE_URL must point to a separate local sandbox database.');
  let parsed: URL;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    throw new Error('MOCK_DATABASE_URL is invalid.');
  }
  const localHosts = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !localHosts.has(parsed.hostname)) {
    throw new Error('MOCK_DATABASE_URL must use PostgreSQL on localhost; mock payments cannot use a remote database.');
  }
  return databaseUrl;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getPaystackSecretKey() {
  const secretKey = process.env.PAYSTACK_SECRET_KEY;
  if (!secretKey) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
  if (!secretKey.startsWith('sk_test_')) {
    throw new Error('Paystack is restricted to test mode. Configure a test secret key beginning with sk_test_.');
  }
  return secretKey;
}

export function getPaystackTestPublicKey() {
  const publicKey = process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY;
  if (!publicKey) throw new Error('NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY is not configured.');
  if (!publicKey.startsWith('pk_test_')) {
    throw new Error('Paystack is restricted to test mode. Configure a test public key beginning with pk_test_.');
  }
  return publicKey;
}

export function getPaystackWebhookSecret() {
  const webhookSecret = process.env.PAYSTACK_WEBHOOK_SECRET;
  if (!webhookSecret) throw new Error('PAYSTACK_WEBHOOK_SECRET is not configured.');
  const secretKey = getPaystackSecretKey();
  if (webhookSecret !== secretKey) {
    throw new Error('PAYSTACK_WEBHOOK_SECRET must match the Paystack test secret key used to sign Paystack webhooks.');
  }
  return webhookSecret;
}

export function assertPaystackTestConfiguration() {
  getPaystackSecretKey();
  getPaystackTestPublicKey();
  getPaystackWebhookSecret();
  getApplicationUrl();
}

export function assertTestPaymentProviderConfiguration(providerCode: string) {
  if (providerCode === 'MOCK') {
    if (!isLocalMockPaymentsEnabled()) {
      throw new Error('Local mock payments are disabled.');
    }
    getMockPaymentWebhookSecret();
    return;
  }
  if (providerCode !== 'PAYSTACK') throw new Error('Unsupported test payment provider.');
  assertPaystackTestConfiguration();
}

export function getMockPaymentWebhookSecret() {
  if (!isLocalMockPaymentsEnabled()) throw new Error('Local mock payments are disabled.');
  const secret = process.env.MOCK_PAYMENT_WEBHOOK_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('MOCK_PAYMENT_WEBHOOK_SECRET must contain at least 32 characters.');
  }
  return secret;
}

export function amountToMinorUnits(amount: string, minorUnits: number) {
  if (!Number.isInteger(minorUnits) || minorUnits < 0 || minorUnits > 4) {
    throw new Error('Unsupported currency precision for payment initialization.');
  }
  if (!/^\d+(?:\.\d+)?$/.test(amount)) throw new Error('Payment amount is not a valid decimal amount.');
  const [whole, fraction = ''] = amount.split('.');
  if (fraction.length > 4) throw new Error('Payment amount has unsupported decimal precision.');
  const normalizedFraction = fraction.padEnd(4, '0');
  const significantFraction = normalizedFraction.slice(0, minorUnits);
  const excessFraction = normalizedFraction.slice(minorUnits);
  if (excessFraction && /[1-9]/.test(excessFraction)) {
    throw new Error('Payment amount must be rounded to the currency minor-unit precision.');
  }
  const minorAmount = BigInt(whole) * (BigInt(10) ** BigInt(minorUnits)) + BigInt(significantFraction || '0');
  if (minorAmount <= BigInt(0) || minorAmount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new Error('Payment amount is outside the provider supported range.');
  }
  return Number(minorAmount);
}

export function getApplicationUrl() {
  const appUrl = process.env.APP_URL;
  if (!appUrl) throw new Error('APP_URL must be configured for payment redirects.');
  const parsed = new URL(appUrl);
  if (parsed.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && parsed.protocol === 'http:')) {
    throw new Error('APP_URL must use HTTPS in production.');
  }
  return parsed.origin;
}

async function readPaystackResponse(response: Response) {
  const result: unknown = await response.json();
  if (!isRecord(result)) throw new Error('Paystack returned an invalid API response.');
  if (!response.ok || result.status !== true) {
    throw new Error(typeof result.message === 'string' ? result.message : 'Paystack request failed.');
  }
  if (!isRecord(result.data)) throw new Error('Paystack returned an invalid transaction response.');
  return result.data;
}

export class PaystackProvider implements PaymentProvider {
  readonly code = 'PAYSTACK';

  supports(currencyCode: string, _countryCode?: string | null) {
    void _countryCode;
    return paystackCurrencies.has(currencyCode.toUpperCase());
  }

  async initialize(input: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    purchaseType: 'TRANSACTION' | 'SUBSCRIPTION' | 'FEATURED_LISTING';
  }): Promise<PaymentInitialization> {
    const secretKey = getPaystackSecretKey();
    getPaystackTestPublicKey();
    if (!this.supports(input.currency)) throw new Error(`Paystack does not support ${input.currency} for this payment.`);
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Paystack requires a positive amount in currency minor units.');
    }

    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: input.email,
        amount: input.amountMinor,
        currency: input.currency.toUpperCase(),
        reference: input.reference,
        callback_url: input.callbackUrl,
        metadata: { payment_reference: input.reference, purchase_type: input.purchaseType },
      }),
    });
    const data = await readPaystackResponse(response);
    if (typeof data.authorization_url !== 'string' || typeof data.reference !== 'string') {
      throw new Error('Paystack did not return an authorization URL and payment reference.');
    }
    return { authorizationUrl: data.authorization_url, reference: data.reference };
  }

  async verify(reference: string): Promise<VerifiedPayment> {
    const secretKey = getPaystackSecretKey();
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${secretKey}` },
    });
    const data = await readPaystackResponse(response);
    const status = data.status;
    if (status !== 'success' && status !== 'failed' && status !== 'abandoned') {
      throw new Error(`Paystack transaction is not in a final state (${String(status)}).`);
    }
    if (typeof data.reference !== 'string' || typeof data.currency !== 'string'
      || typeof data.amount !== 'number' || !Number.isSafeInteger(data.amount)
      || (typeof data.id !== 'number' && typeof data.id !== 'string')) {
      throw new Error('Paystack returned incomplete verified transaction details.');
    }
    return {
      reference: data.reference,
      transactionId: String(data.id),
      status,
      amountMinor: data.amount,
      currency: data.currency.toUpperCase(),
      paidAt: status === 'success' && typeof data.paid_at === 'string' ? new Date(data.paid_at) : null,
    };
  }
}

export class LocalMockPaymentProvider implements PaymentProvider {
  readonly code = 'MOCK';

  supports(currencyCode: string, _countryCode?: string | null) {
    void _countryCode;
    return currencyCodePattern.test(currencyCode.toUpperCase());
  }

  async initialize(input: {
    email: string;
    amountMinor: number;
    currency: string;
    reference: string;
    callbackUrl: string;
    purchaseType: 'TRANSACTION' | 'SUBSCRIPTION' | 'FEATURED_LISTING';
  }): Promise<PaymentInitialization> {
    if (!isLocalMockPaymentsEnabled()) throw new Error('Local mock payments are disabled.');
    getMockPaymentWebhookSecret();
    if (!Number.isSafeInteger(input.amountMinor) || input.amountMinor <= 0) {
      throw new Error('Mock payment requires a positive amount in currency minor units.');
    }
    const origin = new URL(input.callbackUrl).origin;
    const authorizationUrl = new URL('/payments/mock', origin);
    authorizationUrl.searchParams.set('reference', input.reference);
    return { authorizationUrl: authorizationUrl.toString(), reference: input.reference };
  }

  async verify(_reference: string): Promise<VerifiedPayment> {
    void _reference;
    throw new Error('Local mock payments are settled only through the signed mock webhook flow.');
  }
}

export function getPaymentProvider(currencyCode: string, countryCode?: string | null): PaymentProvider {
  if (isLocalMockPaymentsEnabled()) {
    const mockProvider = new LocalMockPaymentProvider();
    if (mockProvider.supports(currencyCode, countryCode)) return mockProvider;
  }
  const providers: PaymentProvider[] = [new PaystackProvider()];
  const provider = providers.find((candidate) => candidate.supports(currencyCode, countryCode));
  if (!provider) {
    throw new UnsupportedPaymentProviderError(
      `No payment provider is configured for ${currencyCode}${countryCode ? ` in ${countryCode}` : ''}.`,
    );
  }
  return provider;
}

export function verifyPaystackWebhookSignature(rawBody: string, signature: string, secret: string) {
  if (!/^[a-f\d]{128}$/i.test(signature)) return false;
  const expected = createHmac('sha512', secret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function signMockPaymentWebhook(rawBody: string, secret = getMockPaymentWebhookSecret()) {
  return createHmac('sha256', secret).update(rawBody).digest('hex');
}

export function verifyMockPaymentWebhookSignature(rawBody: string, signature: string, secret: string) {
  if (!/^[a-f\d]{64}$/i.test(signature)) return false;
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  const provided = Buffer.from(signature, 'hex');
  return provided.length === expected.length && timingSafeEqual(provided, expected);
}

export function parseCheckoutBody(rawBody: string) {
  if (!rawBody.trim()) return checkoutBodySchema.safeParse({});
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return { success: false as const, error: 'Request body must be valid JSON.' };
  }
  return checkoutBodySchema.safeParse(body);
}
