import { NextRequest, NextResponse } from 'next/server';
import { isLocalMockPaymentsEnabled } from '@/lib/payments';
import { processSignedMockWebhook } from '@/lib/mock-payment-webhook';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  if (!isLocalMockPaymentsEnabled()) {
    return NextResponse.json({ error: 'Local mock webhooks are disabled.' }, { status: 404 });
  }
  const signature = request.headers.get('x-mock-signature');
  if (!signature) return NextResponse.json({ error: 'Missing local mock signature.' }, { status: 400 });

  try {
    const result = await processSignedMockWebhook(await request.text(), signature);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json({
      received: true,
      duplicate: result.result.duplicate,
      outcome: result.result.result,
    });
  } catch (error) {
    console.error('Local mock webhook processing failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Local mock webhook processing failed.' }, { status: 500 });
  }
}
