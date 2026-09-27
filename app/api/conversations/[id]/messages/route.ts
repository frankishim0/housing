import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const messageSchema = z.object({ content: z.string().trim().min(1).max(5000) });

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const conversationId = (await params).id;
  const participant = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: user.id } } });
  if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const parsed = messageSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const message = await prisma.message.create({ data: { conversationId, senderId: user.id, content: parsed.data.content } });
  return NextResponse.json({ data: message }, { status: 201 });
}
