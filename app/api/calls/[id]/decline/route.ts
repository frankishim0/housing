import { CallStatus } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { endLiveKitRoom } from '@/lib/livekit';
import { publishRealtimeEvent } from '@/lib/realtime';
import { notifyUsersSafely } from '@/lib/notifications';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const call = await prisma.callSession.findFirst({
    where: { id, status: CallStatus.RINGING, participants: { some: { userId: user.id, status: 'INVITED' } } },
    select: { id: true, initiatorId: true, roomName: true },
  });
  if (!call) return NextResponse.json({ error: 'This invitation is no longer available.' }, { status: 404 });
  try {
    await endLiveKitRoom(call.roomName);
  } catch (error) {
    console.error('Could not end the declined LiveKit room:', error);
    return NextResponse.json({ error: 'The LiveKit room could not be closed. Please try again.' }, { status: 503 });
  }
  await prisma.$transaction([
    prisma.callParticipant.update({ where: { callId_userId: { callId: id, userId: user.id } }, data: { status: 'DECLINED', leftAt: new Date() } }),
    prisma.callSession.update({ where: { id }, data: { status: CallStatus.DECLINED, endedAt: new Date() } }),
  ]);
  await notifyUsersSafely({
    userIds: [call.initiatorId],
    type: 'CALL',
    message: `${user.name} declined your property video call invitation.`,
    eventName: 'call-declined',
    eventData: { callId: id, declinedBy: user.id },
  });
  await publishRealtimeEvent(`user:${call.initiatorId}`, 'call-declined', { callId: id, declinedBy: user.id });
  return NextResponse.json({ data: { declined: true } });
}
