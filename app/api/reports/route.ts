import { NextRequest, NextResponse } from 'next/server';
import { ModerationAuditAction, UserRole } from '@prisma/client';
import { z } from 'zod';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { isReportCategory, isReportTargetType } from '@/lib/moderation';
import { isProfessionalRole, logModerationAction } from '@/lib/verification';

const schema = z.object({
  targetType: z.string().min(1),
  category: z.string().min(1),
  propertyId: z.string().min(1).optional(),
  targetUserId: z.string().min(1).optional(),
  messageId: z.string().min(1).optional(),
  reason: z.string().trim().min(3).max(1000),
  details: z.string().trim().max(4000).optional(),
}).refine((value) => isReportTargetType(value.targetType), 'Choose a valid report target.');

async function validateTarget(input: z.infer<typeof schema>, reporterId: string) {
  if (input.targetType === 'PROPERTY') {
    return Boolean(input.propertyId && !input.targetUserId && !input.messageId
      && await prisma.property.findUnique({ where: { id: input.propertyId }, select: { id: true } }));
  }
  if (input.targetType === 'MESSAGE') {
    return Boolean(input.messageId && !input.propertyId && !input.targetUserId
      && await prisma.message.findFirst({
        where: {
          id: input.messageId,
          conversation: { participants: { some: { userId: reporterId } } },
        },
        select: { id: true },
      }));
  }
  if (!input.targetUserId || input.propertyId || input.messageId) return false;
  const target = await prisma.user.findUnique({ where: { id: input.targetUserId }, select: { id: true, role: true } });
  return Boolean(target && (input.targetType !== 'AGENT' || isProfessionalRole(target.role)));
}

export async function GET() {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const reports = await prisma.report.findMany({
    where: { reporterId: user.id },
    orderBy: { createdAt: 'desc' },
  });
  return NextResponse.json({ data: reports });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  if (!isReportCategory(parsed.data.category)) return NextResponse.json({ error: 'Choose a valid report category.' }, { status: 400 });
  if (parsed.data.targetUserId === user.id) return NextResponse.json({ error: 'You cannot report your own account.' }, { status: 400 });
  if (!await validateTarget(parsed.data, user.id)) return NextResponse.json({ error: 'The selected report target is missing or invalid.' }, { status: 400 });

  const report = await prisma.$transaction(async (tx) => {
    const created = await tx.report.create({
      data: {
        reporterId: user.id,
        targetType: parsed.data.targetType,
        category: parsed.data.category,
        propertyId: parsed.data.propertyId ?? null,
        targetUserId: parsed.data.targetUserId ?? null,
        messageId: parsed.data.messageId ?? null,
        reason: parsed.data.reason,
        details: parsed.data.details ?? null,
      },
    });
    await tx.notification.createMany({
      data: await tx.user.findMany({ where: { role: UserRole.ADMIN }, select: { id: true } }).then((admins) => admins.map((admin) => ({
        userId: admin.id,
        type: 'MODERATION',
        message: `A new ${parsed.data.category.toLowerCase().replace(/_/g, ' ')} report has been submitted.`,
      }))),
    });
    await logModerationAction({
      client: tx,
      actorId: user.id,
      action: ModerationAuditAction.REPORT_CREATED,
      entityType: 'Report',
      entityId: created.id,
      after: { targetType: parsed.data.targetType, category: parsed.data.category },
      reason: parsed.data.reason,
    });
    return created;
  });
  return NextResponse.json({ data: report }, { status: 201 });
}
