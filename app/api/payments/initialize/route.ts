import { NextRequest, NextResponse } from 'next/server';
import { PaymentType } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPaymentProvider } from '@/lib/payments';
import { z } from 'zod';

const schema = z.object({ propertyId: z.string().optional(), amountNaira: z.coerce.number().positive(), paymentType: z.nativeEnum(PaymentType) });

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.propertyId && !(await prisma.property.findUnique({ where: { id: parsed.data.propertyId }, select: { id: true } }))) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }

  const reference = `NH-${crypto.randomUUID()}`;
  const payment = await prisma.payment.create({
    data: { userId: user.id, propertyId: parsed.data.propertyId, amount: parsed.data.amountNaira, paymentType: parsed.data.paymentType, reference },
  });
  try {
    const initialized = await getPaymentProvider().initialize({
      email: user.email,
      amountKobo: Math.round(parsed.data.amountNaira * 100),
      reference,
      callbackUrl: `${new URL(request.url).origin}/payments/callback`,
    });
    return NextResponse.json({ data: { paymentId: payment.id, ...initialized } }, { status: 201 });
  } catch (error) {
    await prisma.payment.update({ where: { id: payment.id }, data: { status: 'FAILED' } });
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment initialization failed.' }, { status: 503 });
  }
}
