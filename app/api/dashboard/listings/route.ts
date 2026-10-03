import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { authorizeListingInventory, ownerListingQuerySchema } from '@/lib/owner-listings';
import { getOwnerListings } from '@/lib/owner-listings-data';

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  const access = authorizeListingInventory(user);
  if (!user || access !== 'ok') {
    return NextResponse.json({ error: access === 'unauthenticated' ? 'Authentication required.' : 'Owner or agent role required.' }, { status: access === 'unauthenticated' ? 401 : 403 });
  }
  const parsed = ownerListingQuerySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  return NextResponse.json({ data: await getOwnerListings(user.id, parsed.data) }, { headers: { 'Cache-Control': 'private, no-store' } });
}
