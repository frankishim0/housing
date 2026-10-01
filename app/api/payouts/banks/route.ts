import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { assertPayoutsTestConfiguration, listBanks } from '@/lib/payouts';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  try {
    assertPayoutsTestConfiguration();
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Seller payouts are disabled.' }, { status: 503 });
  }

  const country = request.nextUrl.searchParams.get('country')?.trim().toLowerCase() || 'nigeria';
  try {
    const banks = await listBanks(country);
    return NextResponse.json({ data: banks });
  } catch (error) {
    console.error('Fetching Paystack bank list failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Unable to load the bank list right now.' }, { status: 502 });
  }
}
