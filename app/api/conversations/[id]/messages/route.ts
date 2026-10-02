import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { classifyUpload, verifyCloudinaryUpload, verifyUploadTicket } from '@/lib/cloudinary';
import { publishRealtimeEvent } from '@/lib/realtime';
import { sendMessageSchema } from '@/lib/messaging';
import { checkRateLimit } from '@/lib/rate-limit';
import { z } from 'zod';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const conversationId = (await params).id;
  const participant = await prisma.conversationParticipant.findUnique({ where: { conversationId_userId: { conversationId, userId: user.id } } });
  if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  const rate = checkRateLimit(`message:send:${user.id}`, 20, 60_000);
  if (!rate.allowed) {
    return NextResponse.json({ error: 'You are sending messages too quickly. Please wait a moment and try again.' }, { status: 429 });
  }
  const parsed = sendMessageSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  let attachment: z.infer<typeof sendMessageSchema>['attachment'] = undefined;
  if (parsed.data.attachment) {
    const candidate = parsed.data.attachment;
    const ticket = verifyUploadTicket(candidate.ticket, { userId: user.id, purpose: { kind: 'message', conversationId } });
    const file = classifyUpload(candidate.mimeType);
    if (!ticket || !file || candidate.size > file.maxBytes || ticket.publicId !== candidate.publicId || ticket.mimeType !== candidate.mimeType || ticket.resourceType !== candidate.resourceType) {
      return NextResponse.json({ error: 'The attachment upload authorization is invalid or expired.' }, { status: 400 });
    }
    if (!await verifyCloudinaryUpload(candidate)) {
      return NextResponse.json({ error: 'The attachment could not be verified against the configured media account.' }, { status: 400 });
    }
    attachment = candidate;
  }
  if (parsed.data.replyToId) {
    const reply = await prisma.message.findFirst({
      where: { id: parsed.data.replyToId, conversationId, deletions: { none: { userId: user.id } } },
      select: { id: true },
    });
    if (!reply) return NextResponse.json({ error: 'The message you are replying to is unavailable.' }, { status: 400 });
  }

  const recipients = await prisma.conversationParticipant.findMany({
    where: { conversationId, userId: { not: user.id } },
    select: { userId: true },
  });
  const message = await prisma.$transaction(async (transaction) => {
    const created = await transaction.message.create({
      data: {
        conversationId,
        senderId: user.id,
        content: parsed.data.content,
        replyToId: parsed.data.replyToId,
        ...(attachment ? {
          attachments: {
            create: {
              fileName: attachment.fileName.replace(/[\\/\r\n\u0000-\u001f]/g, '_'),
              mimeType: attachment.mimeType,
              size: attachment.size,
              url: attachment.secureUrl,
              publicId: attachment.publicId,
            },
          },
        } : {}),
      },
      include: {
        sender: { select: { id: true, name: true, role: true, profileImage: true } },
        attachments: true,
        replyTo: { select: { id: true, content: true, sender: { select: { name: true } } } },
      },
    });
    await transaction.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
    if (recipients.length) {
      await transaction.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.userId,
          type: 'MESSAGE' as const,
          message: `New message from ${user.name}.`,
        })),
      });
    }
    await transaction.user.update({ where: { id: user.id }, data: { lastSeenAt: new Date() } });
    return created;
  });
  const realtimeDelivered = await publishRealtimeEvent(`conversation:${conversationId}`, 'message', message);
  await Promise.all(recipients.map((recipient) => publishRealtimeEvent(`user:${recipient.userId}`, 'notification', {
    type: 'MESSAGE',
    message: `New message from ${user.name}.`,
    conversationId,
  })));
  return NextResponse.json({ data: message, realtimeDelivered }, { status: 201 });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const conversationId = (await params).id;
  const participant = await prisma.conversationParticipant.findUnique({
    where: { conversationId_userId: { conversationId, userId: user.id } },
    select: { userId: true },
  });
  if (!participant) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  const readAt = new Date();
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: user.id }, readAt: null },
    data: { readAt },
  });
  const receiptDelivered = await publishRealtimeEvent(`conversation:${conversationId}`, 'read', { userId: user.id, readAt });
  const messages = await prisma.message.findMany({
    where: { conversationId, deletions: { none: { userId: user.id } } },
    orderBy: { createdAt: 'desc' },
    take: 60,
    include: {
      sender: { select: { id: true, name: true, role: true, profileImage: true } },
      attachments: true,
      replyTo: { select: { id: true, content: true, sender: { select: { name: true } } } },
    },
  });
  return NextResponse.json({ data: messages.reverse(), receiptDelivered });
}
