import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const lastSeenAt = new Date();
  await prisma.user.update({ where: { id: user.id }, data: { lastSeenAt } });
  return NextResponse.json({ data: { lastSeenAt } });
}