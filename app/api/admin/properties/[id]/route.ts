import { NextRequest, NextResponse } from 'next/server';
import { PropertyStatus, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ status: z.enum(['PUBLISHED', 'REJECTED', 'SUSPENDED', 'PAUSED']) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Authentication required.' : 'Admin role required.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const property = await prisma.property.update({
    where: { id: (await params).id },
    data: { status: parsed.data.status as PropertyStatus, publishedAt: parsed.data.status === 'PUBLISHED' ? new Date() : null },
  });
  await prisma.notification.create({ data: { userId: property.ownerId, type: 'PROPERTY', message: `Your property "${property.title}" is now ${parsed.data.status.toLowerCase()}.` } });
  return NextResponse.json({ data: property });
}
