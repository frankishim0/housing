import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publishRealtimeEvent } from '@/lib/realtime';

const schema = z.object({ content: z.string().trim().min(1).max(2000) });

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const call = await prisma.callSession.findFirst({
    where: { id, OR: [{ participants: { some: { userId: user.id } } }, { type: 'LIVE_TOUR', status: 'ACTIVE', property: { status: 'PUBLISHED' } }] },
    select: { id: true },
  });
  if (!call) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const messages = await prisma.callChatMessage.findMany({
    where: { callId: id },
    orderBy: { createdAt: 'asc' },
    take: 100,
    include: { sender: { select: { id: true, name: true, profileImage: true } } },
  });
  return NextResponse.json({ data: messages });
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const participant = await prisma.callParticipant.findUnique({
    where: { callId_userId: { callId: id, userId: user.id } },
    select: { status: true, call: { select: { status: true } } },
  });
  if (!participant || participant.status !== 'JOINED' || !['ACTIVE', 'RINGING'].includes(participant.call.status)) {
    return NextResponse.json({ error: 'Join the call before sending a message.' }, { status: 403 });
  }
  const message = await prisma.callChatMessage.create({
    data: { callId: id, senderId: user.id, content: parsed.data.content },
    include: { sender: { select: { id: true, name: true, profileImage: true } } },
  });
  const delivered = await publishRealtimeEvent(`call:${id}`, 'chat-message', message);
  return NextResponse.json({ data: message, realtimeDelivered: delivered }, { status: 201 });
}
