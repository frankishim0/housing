import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publishRealtimeEvent } from '@/lib/realtime';

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId: id, userId: user.id } },
    select: { userId: true },
  });
  if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const delivered = await publishRealtimeEvent(`conversation:${id}`, 'typing', { userId: user.id, name: user.name, at: Date.now() });
  if (!delivered) return NextResponse.json({ error: 'Real-time typing updates are unavailable.' }, { status: 503 });
  return NextResponse.json({ delivered: true });
}
