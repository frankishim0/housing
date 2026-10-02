import { Prisma, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { ACTIVE_VIEWING_STATUSES, parseViewingSchedule, viewingSlotWindow } from '@/lib/viewings';
import { publishRealtimeEvent } from '@/lib/realtime';
import { z } from 'zod';

const requestSchema = z.object({
  propertyId: z.string().min(1),
  scheduledAt: z.string().datetime({ offset: true }),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  preferredTime: z.string().regex(/^([01]\d|2[0-3]):([0-5]\d)$/),
  timeZoneOffsetMinutes: z.number().int().min(-840).max(720),
  message: z.string().trim().max(2000).optional(),
}).strict();

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let schedule: ReturnType<typeof parseViewingSchedule>;
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

  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: { id: true, title: true, ownerId: true, agentId: true, status: true },
  });
  if (!property || property.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Property is not available for viewings.' }, { status: 404 });
  }
  if (user.id === property.ownerId || user.id === property.agentId || user.role === UserRole.ADMIN) {
    return NextResponse.json({ error: 'Property managers cannot request a viewing of their own listing.' }, { status: 403 });
  }

  const activeStatuses = [...ACTIVE_VIEWING_STATUSES];
  const slotWindow = viewingSlotWindow(schedule.scheduledAt);
  const conflict = await prisma.viewing.findFirst({
    where: {
      propertyId: property.id,
      status: { in: activeStatuses },
      OR: [
        { scheduledAt: slotWindow },
        {
          scheduledAt: null,
          preferredDate: schedule.preferredDate,
          preferredTime: schedule.preferredTime,
        },
      ],
    },
    select: { id: true },
  });
  if (conflict) return NextResponse.json({ error: 'That viewing time is unavailable. Choose another time.' }, { status: 409 });

  const recipientId = property.agentId ?? property.ownerId;
  try {
    const viewing = await prisma.$transaction(async (tx) => {
      const created = await tx.viewing.create({
        data: {
          propertyId: property.id,
          requesterId: user.id,
          scheduledAt: schedule.scheduledAt,
          preferredDate: schedule.preferredDate,
          preferredTime: schedule.preferredTime,
          message: parsed.data.message || null,
        },
        include: {
          property: { select: { id: true, title: true, slug: true } },
          requester: { select: { id: true, name: true } },
        },
      });
      await tx.notification.create({
        data: {
          userId: recipientId,
          type: 'VIEWING',
          message: `New viewing request for ${property.title}.`,
        },
      });
      return created;
    });
    await publishRealtimeEvent(`user:${recipientId}`, 'notification', {
      type: 'VIEWING',
      message: `New viewing request for ${property.title}.`,
      viewingId: viewing.id,
    });
    return NextResponse.json({ data: viewing }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'That viewing time is unavailable. Choose another time.' }, { status: 409 });
    }
    throw error;
  }
}

export async function GET(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const period = request.nextUrl.searchParams.get('period') ?? 'all';
  if (!['all', 'upcoming', 'past'].includes(period)) {
    return NextResponse.json({ error: 'Period must be all, upcoming, or past.' }, { status: 400 });
  }
  const accessFilter: Prisma.ViewingWhereInput = user.role === UserRole.ADMIN
    ? {}
    : {
        OR: [
          { requesterId: user.id },
          { property: { ownerId: user.id } },
          { property: { agentId: user.id } },
        ],
      };
  const timeFilter: Prisma.ViewingWhereInput = period === 'upcoming'
    ? { scheduledAt: { gte: new Date() } }
    : period === 'past'
      ? { scheduledAt: { lt: new Date() } }
      : {};
  const viewings = await prisma.viewing.findMany({
    where: { AND: [accessFilter, timeFilter] },
    include: {
      property: { select: { id: true, title: true, slug: true, ownerId: true, agentId: true } },
      requester: { select: { id: true, name: true } },
    },
    orderBy: [{ scheduledAt: 'asc' }, { preferredDate: 'asc' }, { preferredTime: 'asc' }],
    take: 200,
  });
  return NextResponse.json({ data: viewings });
}
