export interface PaymentInitialization {
  authorizationUrl: string;
  reference: string;
}

export interface PaymentProvider {
  initialize(input: { email: string; amountKobo: number; reference: string; callbackUrl: string }): Promise<PaymentInitialization>;
  verify(reference: string): Promise<{ successful: boolean; reference: string; amountKobo: number }>;
}

export class PaystackProvider implements PaymentProvider {
  private readonly secret = process.env.PAYSTACK_SECRET_KEY;

  async initialize(input: { email: string; amountKobo: number; reference: string; callbackUrl: string }) {
    if (!this.secret) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
    const response = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: input.email, amount: input.amountKobo, reference: input.reference, callback_url: input.callbackUrl }),
    });
    const result = await response.json();
    if (!response.ok || !result.status) throw new Error(result.message ?? 'Paystack initialization failed.');
    return { authorizationUrl: result.data.authorization_url as string, reference: result.data.reference as string };
  }

  async verify(reference: string) {
    if (!this.secret) throw new Error('PAYSTACK_SECRET_KEY is not configured.');
    const response = await fetch(`https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`, { headers: { Authorization: `Bearer ${this.secret}` } });
    const result = await response.json();
    if (!response.ok || !result.status) throw new Error(result.message ?? 'Paystack verification failed.');
    return { successful: result.data.status === 'success', reference: result.data.reference as string, amountKobo: Number(result.data.amount) };
  }
}

export function getPaymentProvider() {
  return new PaystackProvider();
}
