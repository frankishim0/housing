import { NextRequest, NextResponse } from 'next/server';
import type { Prisma } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { notifyUsersSafely } from '@/lib/notifications';
import { buildConversationPairKey, canStartPropertyConversation, startConversationSchema } from '@/lib/messaging';
import { checkRateLimit } from '@/lib/rate-limit';

const conversationInclude = {
  property: {
    select: {
      id: true,
      title: true,
      slug: true,
      ownerId: true,
      agentId: true,
      price: true,
      currencyCode: true,
      media: {
        where: { type: 'IMAGE' },
        orderBy: [{ isCover: 'desc' }, { order: 'asc' }],
        take: 1,
        select: { url: true },
      },
      location: { select: { area: true, city: true, state: true, country: true } },
    },
  },
  participants: {
    include: {
      user: { select: { id: true, name: true, role: true, profileImage: true, lastSeenAt: true } },
    },
  },
} satisfies Prisma.ConversationInclude;

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const rate = checkRateLimit(`conversation:start:${user.id}`, 10, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'Too many conversation requests. Please wait a moment and try again.' }, { status: 429 });
  }
  const parsed = startConversationSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (parsed.data.recipientId === user.id) return NextResponse.json({ error: 'Invalid recipient.' }, { status: 400 });

  const [property, recipient] = await Promise.all([
    prisma.property.findUnique({
      where: { id: parsed.data.propertyId },
      select: {
        id: true,
        title: true,
        ownerId: true,
        agentId: true,
        status: true,
        enquiries: { where: { userId: parsed.data.recipientId }, select: { id: true }, take: 1 },
        viewings: { where: { requesterId: parsed.data.recipientId }, select: { id: true }, take: 1 },
      },
    }),
    prisma.user.findUnique({ where: { id: parsed.data.recipientId }, select: { id: true, name: true, role: true } }),
  ]);
  if (!property || !recipient || ['DRAFT', 'SUSPENDED'].includes(property.status)) {
    return NextResponse.json({ error: 'Property or recipient not found.' }, { status: 404 });
  }
  const authorized = canStartPropertyConversation({
    requesterId: user.id,
    recipientId: recipient.id,
    ownerId: property.ownerId,
    agentId: property.agentId,
    recipientRole: recipient.role,
    hasEnquiry: property.enquiries.length > 0,
    hasViewing: property.viewings.length > 0,
  });
  if (!authorized) {
    return NextResponse.json({ error: 'Recipient is not associated with this property.' }, { status: 400 });
  }

  const pairKey = buildConversationPairKey(property.id, user.id, recipient.id);
  let conversation = await prisma.conversation.findUnique({ where: { pairKey }, select: { id: true } });
  let created = false;

  if (!conversation) {
    const legacy = await prisma.conversation.findFirst({
      where: {
        propertyId: property.id,
        participants: { some: { userId: user.id } },
        AND: [{ participants: { some: { userId: recipient.id } } }],
      },
      select: { id: true },
    });
    if (legacy) {
      conversation = await prisma.conversation.update({ where: { id: legacy.id }, data: { pairKey }, select: { id: true } });
    } else {
      try {
        conversation = await prisma.conversation.create({
          data: {
            propertyId: property.id,
            pairKey,
            participants: { create: [{ userId: user.id }, { userId: recipient.id }] },
          },
          select: { id: true },
        });
        created = true;
      } catch (error) {
        if (!(error instanceof Error) || !('code' in error) || error.code !== 'P2002') throw error;
        conversation = await prisma.conversation.findUnique({ where: { pairKey }, select: { id: true } });
        if (!conversation) throw error;
      }
    }
  }

  if (parsed.data.content) {
    const message = await prisma.message.create({
      data: { conversationId: conversation.id, senderId: user.id, content: parsed.data.content },
      select: { id: true },
    });
    await prisma.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
    await notifyUsersSafely({
      userIds: [recipient.id],
      type: 'MESSAGE',
      message: `New message from ${user.name} about ${property.title}.`,
      eventName: 'notification',
      eventData: { conversationId: conversation.id, propertyId: property.id },
    });
    return NextResponse.json({ data: { id: conversation.id, messageId: message.id } }, { status: created ? 201 : 200 });
  }

  const result = await prisma.conversation.findUnique({ where: { id: conversation.id }, include: conversationInclude });
  return NextResponse.json({ data: result }, { status: created ? 201 : 200 });
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const query = request.nextUrl.searchParams.get('q')?.trim().slice(0, 80);
  const conversations = await prisma.conversation.findMany({
    where: {
      participants: { some: { userId: user.id } },
      ...(query ? {
        OR: [
          { property: { title: { contains: query, mode: 'insensitive' } } },
          { participants: { some: { userId: { not: user.id }, user: { name: { contains: query, mode: 'insensitive' } } } } },
        ],
      } : {}),
    },
    include: {
      ...conversationInclude,
      messages: {
        where: { deletions: { none: { userId: user.id } } },
        orderBy: { createdAt: 'desc' },
        take: 1,
        select: { id: true, content: true, senderId: true, createdAt: true, attachments: { select: { id: true, fileName: true } } },
      },
      _count: {
        select: {
          messages: { where: { senderId: { not: user.id }, readAt: null, deletions: { none: { userId: user.id } } } },
        },
      },
    },
    orderBy: { updatedAt: 'desc' },
  });
  return NextResponse.json({ data: conversations });
}
