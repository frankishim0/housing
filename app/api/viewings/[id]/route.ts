import { NextRequest, NextResponse } from 'next/server';
import { ViewingStatus } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const updateSchema = z.object({ status: z.nativeEnum(ViewingStatus), preferredDate: z.coerce.date().optional(), preferredTime: z.string().optional() });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const viewing = await prisma.viewing.findUnique({ where: { id: (await params).id }, include: { property: true } });
  if (!viewing) return NextResponse.json({ error: 'Viewing not found.' }, { status: 404 });
  const isManager = viewing.property.ownerId === user.id || viewing.property.agentId === user.id || user.role === 'ADMIN';
  if (!isManager && viewing.requesterId !== user.id) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.status === ViewingStatus.ACCEPTED) {
    const conflict = await prisma.viewing.findFirst({
      where: { id: { not: viewing.id }, propertyId: viewing.propertyId, preferredDate: parsed.data.preferredDate ?? viewing.preferredDate, preferredTime: parsed.data.preferredTime ?? viewing.preferredTime, status: ViewingStatus.ACCEPTED },
    });
    if (conflict) return NextResponse.json({ error: 'That viewing slot is already accepted.' }, { status: 409 });
  }
  const updated = await prisma.viewing.update({ where: { id: viewing.id }, data: { status: parsed.data.status, preferredDate: parsed.data.preferredDate, preferredTime: parsed.data.preferredTime } });
  await prisma.notification.create({ data: { userId: viewing.requesterId, type: 'VIEWING', message: `Your viewing for ${viewing.property.title} is now ${parsed.data.status.toLowerCase()}.` } });
  return NextResponse.json({ data: updated });
}
