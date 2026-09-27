import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const viewingSchema = z.object({
  propertyId: z.string().min(1),
  preferredDate: z.coerce.date(),
  preferredTime: z.string().trim().min(1).max(20),
  message: z.string().trim().max(2000).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = viewingSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { id: parsed.data.propertyId } });
  if (!property || property.status !== 'PUBLISHED') return NextResponse.json({ error: 'Property is not available.' }, { status: 404 });

  const conflict = await prisma.viewing.findFirst({
    where: {
      propertyId: property.id,
      preferredDate: parsed.data.preferredDate,
      preferredTime: parsed.data.preferredTime,
      status: { in: ['REQUESTED', 'ACCEPTED', 'RESCHEDULED'] },
    },
  });
  if (conflict) return NextResponse.json({ error: 'That viewing slot is already requested.' }, { status: 409 });

  const viewing = await prisma.viewing.create({
    data: {
      propertyId: property.id,
      requesterId: user.id,
      preferredDate: parsed.data.preferredDate,
      preferredTime: parsed.data.preferredTime,
      message: parsed.data.message,
    },
  });

  await prisma.notification.create({
    data: {
      userId: property.agentId ?? property.ownerId,
      type: 'VIEWING',
      message: `New viewing request for ${property.title}.`,
    },
  });
  return NextResponse.json({ data: viewing }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const viewings = await prisma.viewing.findMany({
    where: { OR: [{ requesterId: user.id }, { property: { ownerId: user.id } }, { property: { agentId: user.id } }] },
    include: { property: { select: { id: true, title: true, slug: true } }, requester: { select: { id: true, name: true, email: true } } },
    orderBy: [{ preferredDate: 'asc' }, { preferredTime: 'asc' }],
  });
  return NextResponse.json({ data: viewings });
}
