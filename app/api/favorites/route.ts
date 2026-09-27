import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { presentProperty } from '@/lib/property-presenter';

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const favorites = await prisma.favorite.findMany({
    where: { userId: user.id },
    include: { property: { include: { location: true, media: true, amenities: true, owner: true, agent: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ data: favorites.map((item) => presentProperty(item.property, true)) });
}
