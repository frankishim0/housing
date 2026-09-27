import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getPaymentProvider } from '@/lib/payments';
import { z } from 'zod';

const schema = z.object({ reference: z.string().min(1) });

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const payment = await prisma.payment.findUnique({ where: { reference: parsed.data.reference } });
  if (!payment || payment.userId !== user.id) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

  try {
    const verification = await getPaymentProvider().verify(payment.reference);
    const updated = await prisma.payment.update({
      where: { id: payment.id },
      data: { status: verification.successful ? 'SUCCESSFUL' : 'FAILED', paymentDate: verification.successful ? new Date() : null },
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Payment verification failed.' }, { status: 503 });
  }
}
