import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Refunds remain disabled until the Paystack test-mode payment flow has been fully tested.' },
    { status: 503 },
  );
}
