import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const updateSchema = z.object({ id: z.string().min(1).optional(), all: z.boolean().optional() });

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const [data, unread] = await Promise.all([
    prisma.notification.findMany({
      where: { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, type: true, message: true, read: true, createdAt: true },
    }),
    prisma.notification.count({ where: { userId: user.id, read: false } }),
  ]);
  return NextResponse.json({ data, unread });
}

export async function PATCH(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success || (!parsed.data.id && !parsed.data.all)) {
    return NextResponse.json({ error: 'Provide a notification id or request to mark all as read.' }, { status: 400 });
  }
  const result = await prisma.notification.updateMany({
    where: { userId: user.id, read: false, ...(parsed.data.id ? { id: parsed.data.id } : {}) },
    data: { read: true },
  });
  return NextResponse.json({ updated: result.count });
}
