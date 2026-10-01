import { NextRequest, NextResponse } from 'next/server';
import { getPaystackWebhookSecret, PaystackProvider, verifyPaystackWebhookSignature } from '@/lib/payments';
import { processPaystackPayment } from '@/lib/paystack-purchases';
import { isPaystackTransferEvent, isPayoutsEnabled, processTransferWebhookEvent } from '@/lib/payouts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function isPaystackEvent(value: unknown): value is {
  event: string;
  data: { reference: string };
} {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const event = value as Record<string, unknown>;
  if (typeof event.event !== 'string' || typeof event.data !== 'object' || event.data === null || Array.isArray(event.data)) {
    return false;
  }
  return typeof (event.data as Record<string, unknown>).reference === 'string';
}

export async function POST(request: NextRequest) {
  const signature = request.headers.get('x-paystack-signature');
  if (!signature) return NextResponse.json({ error: 'Missing Paystack signature.' }, { status: 400 });

  let webhookSecret: string;
  try {
    webhookSecret = getPaystackWebhookSecret();
  } catch (error) {
    console.error('Paystack webhook configuration failure:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Paystack test webhook configuration is unavailable.' }, { status: 503 });
  }

  const rawBody = await request.text();
  if (!verifyPaystackWebhookSignature(rawBody, signature, webhookSecret)) {
    return NextResponse.json({ error: 'Invalid Paystack webhook signature.' }, { status: 400 });
  }

  let event: unknown;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Invalid Paystack webhook payload.' }, { status: 400 });
  }

  if (isPaystackTransferEvent(event)) {
    if (!isPayoutsEnabled()) return NextResponse.json({ received: true, ignored: true, reason: 'payouts_disabled' });
    try {
      const result = await processTransferWebhookEvent(event);
      return NextResponse.json({ received: true, duplicate: result.duplicate, outcome: result.outcome });
    } catch (error) {
      console.error('Paystack transfer webhook processing failure:', error instanceof Error ? error.message : 'Unknown error');
      return NextResponse.json({ error: 'Paystack transfer webhook processing failed; delivery may be retried.' }, { status: 500 });
    }
  }

  if (!isPaystackEvent(event)) return NextResponse.json({ error: 'Invalid Paystack webhook payload.' }, { status: 400 });
  if (event.event !== 'charge.success' && event.event !== 'charge.failed') {
    return NextResponse.json({ received: true, ignored: true });
  }

  try {
    const verified = await new PaystackProvider().verify(event.data.reference);
    if (verified.reference !== event.data.reference) {
      throw new Error('Paystack verification returned a different payment reference.');
    }
    if ((event.event === 'charge.success' && verified.status !== 'success')
      || (event.event === 'charge.failed' && verified.status !== 'failed')) {
      return NextResponse.json({ received: true, ignored: true, reason: 'verified_status_mismatch' });
    }
    const result = await processPaystackPayment(verified);
    return NextResponse.json({
      received: true,
      duplicate: result.duplicate,
      outcome: result.result,
    });
  } catch (error) {
    if (error instanceof Error && error.message === 'Paystack amount or currency does not match the server-side purchase.') {
      console.error('Paystack webhook financial values did not match the server-side purchase.');
      return NextResponse.json({ error: 'Paystack payment does not match the recorded purchase.' }, { status: 400 });
    }
    console.error('Paystack webhook processing failure:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Paystack webhook processing failed; delivery may be retried.' }, { status: 500 });
  }
}
