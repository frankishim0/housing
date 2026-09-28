import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { processPaystackPayment } from '@/lib/paystack-purchases';
import { getApplicationUrl, getPaymentProvider } from '@/lib/payments';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ reference: z.string().min(1).max(100) }).strict();

async function verifyReference(reference: string, userId: string) {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { id: true, userId: true, provider: true, providerReference: true, currency: true },
  });
  if (!payment || payment.userId !== userId || payment.provider !== 'PAYSTACK') {
    return { status: 404 as const, message: 'Paystack payment not found.' };
  }
  if (payment.providerReference && payment.providerReference !== reference) {
    return { status: 409 as const, message: 'Paystack reference does not match this payment.' };
  }

  const verified = await getPaymentProvider(payment.currency).verify(reference);
  if (verified.reference !== reference) throw new Error('Paystack verification returned a different payment reference.');
  const result = await processPaystackPayment(verified);
  return { status: 200 as const, result: result.result, duplicate: result.duplicate, paymentStatus: verified.status };
}

export async function GET(request: NextRequest) {
  const appUrl = getApplicationUrl();
  const user = await getSessionUser();
  if (!user) return NextResponse.redirect(new URL('/auth', appUrl));
  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference) return NextResponse.redirect(new URL('/dashboard/transactions?payment=invalid', appUrl));

  try {
    const result = await verifyReference(reference, user.id);
    if (result.status !== 200) {
      return NextResponse.redirect(new URL('/dashboard/transactions?payment=error', appUrl));
    }
    const outcome = result.paymentStatus === 'success'
      ? 'success'
      : result.paymentStatus === 'abandoned'
        ? 'cancelled'
        : 'failed';
    return NextResponse.redirect(new URL(`/dashboard/transactions?payment=${outcome}`, appUrl));
  } catch (error) {
    console.error('Paystack return verification failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.redirect(new URL('/dashboard/transactions?payment=pending', appUrl));
  }
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  let requestBody: unknown;
  try {
    requestBody = await request.json();
  } catch {
    return NextResponse.json({ error: 'Request body must be valid JSON.' }, { status: 400 });
  }
  const parsed = schema.safeParse(requestBody);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await verifyReference(parsed.data.reference, user.id);
    if (result.status !== 200) return NextResponse.json({ error: result.message }, { status: result.status });
    return NextResponse.json({ data: result });
  } catch (error) {
    console.error('Paystack payment verification failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Paystack payment verification is temporarily unavailable.' }, { status: 503 });
  }
}
