import { NextResponse } from 'next/server';

export async function POST() {
  return NextResponse.json(
    { error: 'Direct payment initialization is not supported. Start payment from a server-generated transaction quote or monetization order.' },
    { status: 400 },
  );
}
