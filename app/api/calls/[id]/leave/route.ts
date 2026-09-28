import { CallStatus, CallType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { endLiveKitRoom } from '@/lib/livekit';
import { publishRealtimeEvent } from '@/lib/realtime';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const call = await prisma.callSession.findUnique({
    where: { id },
    include: { participants: { where: { userId: user.id }, select: { userId: true } } },
  });
  if (!call || !call.participants.length) return NextResponse.json({ error: 'You are not a participant in this call.' }, { status: 403 });

  const now = new Date();
  const shouldEnd = call.type === CallType.VIDEO_CALL || call.initiatorId === user.id;
  if (shouldEnd) {
    try {
      await endLiveKitRoom(call.roomName);
    } catch (error) {
      console.error('Could not end the LiveKit room:', error);
      return NextResponse.json({ error: 'The LiveKit room could not be ended. Please try again.' }, { status: 503 });
    }
  }
  await prisma.callParticipant.update({
    where: { callId_userId: { callId: id, userId: user.id } },
    data: { status: 'LEFT', leftAt: now },
  });
  if (shouldEnd) {
    await prisma.callSession.updateMany({
      where: { id, status: { in: [CallStatus.RINGING, CallStatus.ACTIVE] } },
      data: { status: CallStatus.ENDED, endedAt: now },
    });
  }
  await publishRealtimeEvent(`call:${id}`, 'participant-left', { userId: user.id, ended: shouldEnd });
  return NextResponse.json({ data: { ended: shouldEnd } });
}
