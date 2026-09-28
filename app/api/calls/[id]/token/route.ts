import { CallStatus, CallType } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { createLiveKitToken } from '@/lib/livekit';
import { prisma } from '@/lib/prisma';

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await params;
  const call = await prisma.callSession.findUnique({
    where: { id },
    include: { property: { select: { status: true } }, participants: { where: { userId: user.id }, select: { status: true } } },
  });
  if (!call || call.status === CallStatus.ENDED || call.status === CallStatus.DECLINED || call.status === CallStatus.CANCELLED) {
    return NextResponse.json({ error: 'This call is no longer available.' }, { status: 404 });
  }

  let participant = call.participants[0];
  if (!participant && call.type === CallType.LIVE_TOUR && call.status === CallStatus.ACTIVE && call.property.status === 'PUBLISHED') {
    await prisma.callParticipant.create({ data: { callId: call.id, userId: user.id, status: 'JOINED', joinedAt: new Date() } });
    participant = { status: 'JOINED' };
  }
  if (!participant) return NextResponse.json({ error: 'You were not invited to this call.' }, { status: 403 });

  const canPublish = call.type === CallType.VIDEO_CALL || call.initiatorId === user.id;
  try {
    const access = await createLiveKitToken({ identity: user.id, name: user.name, roomName: call.roomName, canPublish });
    if (participant.status !== 'JOINED') {
      await prisma.callParticipant.update({
        where: { callId_userId: { callId: call.id, userId: user.id } },
        data: { status: 'JOINED', joinedAt: new Date(), leftAt: null },
      });
      if (call.type === CallType.VIDEO_CALL && call.status === CallStatus.RINGING) {
        await prisma.callSession.update({ where: { id: call.id }, data: { status: CallStatus.ACTIVE, startedAt: new Date() } });
      }
    }
    return NextResponse.json({ data: { ...access, callId: call.id, type: call.type, canPublish } });
  } catch (error) {
    console.error('LiveKit token creation failed:', error);
    return NextResponse.json({ error: 'Real-time calling is not configured.' }, { status: 503 });
  }
}
