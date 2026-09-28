import crypto from 'node:crypto';
import { CallStatus, CallType } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { publishRealtimeEvent } from '@/lib/realtime';

const createSchema = z.object({
  propertyId: z.string().min(1),
  type: z.nativeEnum(CallType),
  recipientId: z.string().min(1).optional(),
  conversationId: z.string().min(1).optional(),
}).refine((value) => !value.conversationId || (value.type === CallType.VIDEO_CALL && Boolean(value.recipientId)), {
  message: 'A property-linked video call requires its conversation and recipient.',
});

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { propertyId, type, recipientId, conversationId } = parsed.data;
  if (type === CallType.VIDEO_CALL && (!recipientId || recipientId === user.id)) {
    return NextResponse.json({ error: 'Choose another participant for a video call.' }, { status: 400 });
  }
  if (type === CallType.LIVE_TOUR && recipientId) {
    return NextResponse.json({ error: 'Live tours are open to interested users and do not require an invitee.' }, { status: 400 });
  }

  const property = await prisma.property.findUnique({
    where: { id: propertyId },
    select: {
      id: true,
      title: true,
      slug: true,
      ownerId: true,
      agentId: true,
      status: true,
      enquiries: { where: { userId: recipientId ?? '' }, select: { id: true }, take: 1 },
      viewings: { where: { requesterId: recipientId ?? '' }, select: { id: true }, take: 1 },
    },
  });
  if (!property || property.status !== 'PUBLISHED') return NextResponse.json({ error: 'Published property not found.' }, { status: 404 });
  const isContact = [property.ownerId, property.agentId].includes(user.id);
  if (type === CallType.LIVE_TOUR && !isContact) return NextResponse.json({ error: 'Only the property owner or assigned agent can start a live tour.' }, { status: 403 });

  let recipient: { id: string; name: string } | null = null;
  if (type === CallType.VIDEO_CALL && recipientId) {
    const conversation = conversationId ? await prisma.conversation.findFirst({
      where: {
        id: conversationId,
        propertyId,
        participants: { some: { userId: user.id } },
        AND: [{ participants: { some: { userId: recipientId } } }],
      },
      select: { id: true },
    }) : null;
    if (conversationId && !conversation) return NextResponse.json({ error: 'The conversation is not associated with these call participants and property.' }, { status: 403 });
    const [candidate, hasContactRelationship] = await Promise.all([
      prisma.user.findUnique({ where: { id: recipientId }, select: { id: true, name: true } }),
      Promise.resolve(Boolean(conversation) || [property.ownerId, property.agentId].includes(recipientId) || property.enquiries.length > 0 || property.viewings.length > 0),
    ]);
    if (!candidate || !hasContactRelationship) return NextResponse.json({ error: 'The other participant is not associated with this property.' }, { status: 403 });
    if (isContact && ![property.ownerId, property.agentId].includes(recipientId)) {
      const recipientUser = await prisma.user.findUnique({ where: { id: recipientId }, select: { role: true } });
      if (!recipientUser || !['USER', 'TENANT'].includes(recipientUser.role)) return NextResponse.json({ error: 'Only an interested buyer or tenant can be contacted.' }, { status: 403 });
    } else if (!isContact && ![property.ownerId, property.agentId].includes(recipientId)) {
      return NextResponse.json({ error: 'Calls must be with the property owner or assigned agent.' }, { status: 403 });
    }
    recipient = candidate;
  }

  const roomName = `property-${property.id}-${crypto.randomUUID()}`;
  const call = await prisma.callSession.create({
    data: {
      propertyId,
      initiatorId: user.id,
      roomName,
      type,
      status: type === CallType.LIVE_TOUR ? CallStatus.ACTIVE : CallStatus.RINGING,
      startedAt: type === CallType.LIVE_TOUR ? new Date() : null,
      participants: {
        create: [
          { userId: user.id, status: 'JOINED', joinedAt: new Date() },
          ...(recipient ? [{ userId: recipient.id, status: 'INVITED' }] : []),
        ],
      },
    },
    select: { id: true, propertyId: true, roomName: true, type: true, status: true, createdAt: true },
  });

  if (recipient) {
    const notification = `Incoming property video call from ${user.name} about ${property.title}.`;
    await prisma.notification.create({ data: { userId: recipient.id, type: 'CALL', message: notification } });
    await publishRealtimeEvent(`user:${recipient.id}`, 'incoming-call', {
      callId: call.id,
      propertyId,
      propertyTitle: property.title,
      propertySlug: property.slug,
      callerId: user.id,
      callerName: user.name,
      type: call.type,
    });
  } else {
    const [enquiries, favorites] = await Promise.all([
      prisma.enquiry.findMany({ where: { propertyId }, select: { userId: true }, distinct: ['userId'], take: 500 }),
      prisma.favorite.findMany({ where: { propertyId }, select: { userId: true }, distinct: ['userId'], take: 500 }),
    ]);
    const interestedUserIds = [...new Set([...enquiries, ...favorites].map(({ userId }) => userId).filter((id) => id !== user.id))];
    if (interestedUserIds.length) {
      await prisma.notification.createMany({
        data: interestedUserIds.map((userId) => ({ userId, type: 'LIVE_TOUR', message: `A live tour has started for ${property.title}.` })),
      });
      await Promise.all(interestedUserIds.map((userId) => publishRealtimeEvent(`user:${userId}`, 'live-tour', {
        callId: call.id,
        propertyId,
        propertyTitle: property.title,
        propertySlug: property.slug,
      })));
    }
    await publishRealtimeEvent(`property:${propertyId}`, 'live-tour', { callId: call.id, propertyTitle: property.title, propertySlug: property.slug });
  }

  return NextResponse.json({ data: call }, { status: 201 });
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const propertyId = request.nextUrl.searchParams.get('propertyId');
  if (request.nextUrl.searchParams.get('inbox') === '1') {
    const calls = await prisma.callSession.findMany({
      where: {
        status: CallStatus.RINGING,
        type: CallType.VIDEO_CALL,
        participants: { some: { userId: user.id, status: 'INVITED' } },
      },
      include: {
        initiator: { select: { id: true, name: true, profileImage: true } },
        property: { select: { id: true, title: true, slug: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 10,
    });
    return NextResponse.json({ data: calls }, { headers: { 'Cache-Control': 'no-store' } });
  }
  if (!propertyId) return NextResponse.json({ error: 'A property is required.' }, { status: 400 });

  const calls = await prisma.callSession.findMany({
    where: {
      propertyId,
      OR: [
        { type: CallType.LIVE_TOUR, status: CallStatus.ACTIVE },
        { participants: { some: { userId: user.id } } },
      ],
    },
    include: {
      initiator: { select: { id: true, name: true, profileImage: true } },
      participants: { select: { userId: true, status: true, user: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take: 20,
  });
  return NextResponse.json({ data: calls });
}
