import { Prisma, UserRole, ViewingStatus } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import {
  ACTIVE_VIEWING_STATUSES,
  canManageViewingTransition,
  canRequesterUpdateViewing,
  parseViewingSchedule,
  viewingSlotWindow,
} from '@/lib/viewings';
import { publishRealtimeEvent } from '@/lib/realtime';
import { z } from 'zod';

const updateSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('approve') }).strict(),
  z.object({ action: z.literal('reject') }).strict(),
  z.object({
    action: z.literal('propose'),
    scheduledAt: z.string().datetime({ offset: true }),
    preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    preferredTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
    timeZoneOffsetMinutes: z.number().int().min(-840).max(720),
    message: z.string().trim().max(2000).optional(),
  }).strict(),
  z.object({ action: z.literal('confirm') }).strict(),
  z.object({ action: z.literal('cancel') }).strict(),
]);

function errorResponse(error: unknown) {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    return NextResponse.json({ error: 'That viewing time has already been requested. Choose another time.' }, { status: 409 });
  }
  throw error;
}

export async function GET(_request: NextRequest, context: RouteContext<'/api/viewings/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const viewing = await prisma.viewing.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, title: true, slug: true, ownerId: true, agentId: true } },
      requester: { select: { id: true, name: true } },
    },
  });
  if (!viewing) return NextResponse.json({ error: 'Viewing not found.' }, { status: 404 });
  const authorized = user.role === UserRole.ADMIN
    || viewing.requesterId === user.id
    || viewing.property.ownerId === user.id
    || viewing.property.agentId === user.id;
  if (!authorized) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  return NextResponse.json({ data: viewing });
}

export async function PATCH(request: NextRequest, context: RouteContext<'/api/viewings/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const viewing = await prisma.viewing.findUnique({
    where: { id },
    include: {
      property: { select: { id: true, title: true, ownerId: true, agentId: true } },
    },
  });
  if (!viewing) return NextResponse.json({ error: 'Viewing not found.' }, { status: 404 });

  const isManager = user.role === UserRole.ADMIN
    || viewing.property.ownerId === user.id
    || viewing.property.agentId === user.id;
  const isRequester = viewing.requesterId === user.id;
  const action = parsed.data.action;
  if (isManager && ['confirm', 'cancel'].includes(action)) {
    return NextResponse.json({ error: 'Only the requesting buyer or tenant can confirm or cancel this request.' }, { status: 403 });
  }
  if (!isManager && !isRequester) return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });

  let status: ViewingStatus;
  let schedule: ReturnType<typeof parseViewingSchedule> | null = null;
  if (action === 'propose') {
    if (!isManager || !canManageViewingTransition(viewing.status, 'propose')) {
      return NextResponse.json({ error: 'This viewing cannot be rescheduled in its current state.' }, { status: 409 });
    }
    try {
      schedule = parseViewingSchedule(
        parsed.data.scheduledAt,
        parsed.data.preferredDate,
        parsed.data.preferredTime,
        parsed.data.timeZoneOffsetMinutes,
      );
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : 'Invalid viewing date and time.' }, { status: 400 });
    }
    status = ViewingStatus.RESCHEDULED;
  } else if (action === 'approve' || action === 'reject') {
    if (!isManager || !canManageViewingTransition(viewing.status, action)) {
      return NextResponse.json({ error: 'This viewing cannot be updated in its current state.' }, { status: 409 });
    }
    status = action === 'approve' ? ViewingStatus.ACCEPTED : ViewingStatus.REJECTED;
  } else {
    const requesterAction = action as 'confirm' | 'cancel';
    if (!isRequester || !canRequesterUpdateViewing(viewing.status, requesterAction)) {
      return NextResponse.json({ error: 'This viewing cannot be updated in its current state.' }, { status: 409 });
    }
    status = action === 'confirm' ? ViewingStatus.ACCEPTED : ViewingStatus.CANCELLED;
  }

  if (status === ViewingStatus.ACCEPTED || schedule) {
    const targetTime = schedule?.scheduledAt ?? viewing.scheduledAt;
    if (targetTime) {
      const slotWindow = viewingSlotWindow(targetTime);
      const conflict = await prisma.viewing.findFirst({
        where: {
          id: { not: viewing.id },
          propertyId: viewing.propertyId,
          status: { in: [...ACTIVE_VIEWING_STATUSES] },
          OR: [
            { scheduledAt: slotWindow },
            {
              scheduledAt: null,
              preferredDate: schedule?.preferredDate ?? viewing.preferredDate,
              preferredTime: schedule?.preferredTime ?? viewing.preferredTime,
            },
          ],
        },
        select: { id: true },
      });
      if (conflict) return NextResponse.json({ error: 'That viewing time is unavailable. Choose another time.' }, { status: 409 });
    }
  }

  const receiverId = isManager ? viewing.requesterId : (viewing.property.agentId ?? viewing.property.ownerId);
  const message = action === 'approve'
    ? `Your viewing for ${viewing.property.title} has been approved.`
    : action === 'reject'
      ? `Your viewing request for ${viewing.property.title} was declined.`
      : action === 'propose'
        ? `A new viewing time was proposed for ${viewing.property.title}. Please confirm or cancel it.`
        : action === 'confirm'
          ? `The viewing for ${viewing.property.title} is confirmed.`
          : `The viewing request for ${viewing.property.title} was cancelled.`;

  try {
    const updated = await prisma.$transaction(async (tx) => {
      const result = await tx.viewing.updateMany({
        where: { id: viewing.id, status: viewing.status },
        data: {
          status,
          ...(schedule ? {
            scheduledAt: schedule.scheduledAt,
            preferredDate: schedule.preferredDate,
            preferredTime: schedule.preferredTime,
          } : {}),
          ...(action === 'propose' && parsed.data.action === 'propose'
            ? { message: parsed.data.message ?? viewing.message }
            : {}),
        },
      });
      if (result.count !== 1) throw new Error('VIEWING_CHANGED');
      const updatedViewing = await tx.viewing.findUniqueOrThrow({
        where: { id: viewing.id },
        include: {
          property: { select: { id: true, title: true, slug: true, ownerId: true, agentId: true } },
          requester: { select: { id: true, name: true } },
        },
      });
      await tx.notification.create({ data: { userId: receiverId, type: 'VIEWING', message } });
      return updatedViewing;
    });
    await publishRealtimeEvent(`user:${receiverId}`, 'notification', {
      type: 'VIEWING',
      message,
      viewingId: updated.id,
    });
    return NextResponse.json({ data: updated });
  } catch (error) {
    if (error instanceof Error && error.message === 'VIEWING_CHANGED') {
      return NextResponse.json({ error: 'This viewing was updated by someone else. Refresh and try again.' }, { status: 409 });
    }
    return errorResponse(error);
  }
}
