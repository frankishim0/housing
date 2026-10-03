import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notifyUsersSafely } from '@/lib/notifications';
import { z } from 'zod';

const enquirySchema = z.object({
  propertyId: z.string().min(1),
  message: z.string().trim().min(10).max(5000),
  contact: z.string().trim().max(100).optional(),
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = enquirySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { id: parsed.data.propertyId } });
  if (!property || property.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Property is not available.' }, { status: 404 });
  }
  if (property.ownerId === user.id || property.agentId === user.id) {
    return NextResponse.json({ error: 'You cannot enquire about your own listing.' }, { status: 400 });
  }

  const enquiry = await prisma.enquiry.create({
    data: {
      userId: user.id,
      propertyId: property.id,
      message: parsed.data.message,
      contact: parsed.data.contact,
    },
  });

  const recipientId = property.agentId ?? property.ownerId;
  await notifyUsersSafely({
    userIds: [recipientId],
    type: 'ENQUIRY',
    message: `New enquiry received for ${property.title}.`,
    eventName: 'notification',
    eventData: { enquiryId: enquiry.id, propertyId: property.id },
  });

  return NextResponse.json({ data: enquiry }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const enquiries = await prisma.enquiry.findMany({
    where: { OR: [{ userId: user.id }, { property: { ownerId: user.id } }, { property: { agentId: user.id } }] },
    include: { property: { select: { id: true, title: true, slug: true } }, user: { select: { id: true, name: true, email: true } } },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ data: enquiries });
}
