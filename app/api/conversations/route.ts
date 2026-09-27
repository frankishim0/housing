import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const conversationSchema = z.object({ propertyId: z.string().min(1), recipientId: z.string().min(1), content: z.string().trim().min(1).max(5000) });

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = conversationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.recipientId === user.id) return NextResponse.json({ error: 'Invalid recipient.' }, { status: 400 });

  const property = await prisma.property.findUnique({ where: { id: parsed.data.propertyId } });
  if (!property || ![property.ownerId, property.agentId].includes(parsed.data.recipientId)) return NextResponse.json({ error: 'Recipient is not associated with this property.' }, { status: 400 });

  const conversation = await prisma.conversation.create({
    data: {
      propertyId: property.id,
      participants: { create: [{ userId: user.id }, { userId: parsed.data.recipientId }] },
      messages: { create: { senderId: user.id, content: parsed.data.content } },
    },
    include: { messages: true, participants: true },
  });
  return NextResponse.json({ data: conversation }, { status: 201 });
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const conversations = await prisma.conversation.findMany({
    where: { participants: { some: { userId: user.id } } },
    include: { property: { select: { id: true, title: true, slug: true } }, participants: { include: { user: { select: { id: true, name: true } } } }, messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ data: conversations });
}
