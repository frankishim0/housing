import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id: conversationId, messageId } = await params;
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { userId: true },
  });
  if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const message = await prisma.message.findFirst({ where: { id: messageId, conversationId }, select: { id: true } });
  if (!message) return NextResponse.json({ error: 'Message not found.' }, { status: 404 });
  await prisma.messageDeletion.upsert({
    where: { messageId_userId: { messageId, userId: user.id } },
    create: { messageId, userId: user.id },
    update: { deletedAt: new Date() },
  });
  return NextResponse.json({ data: { id: messageId, hidden: true } });
}