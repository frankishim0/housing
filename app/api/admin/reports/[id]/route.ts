import { NextRequest, NextResponse } from 'next/server';
import { ModerationAuditAction, UserRole } from '@prisma/client';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { logModerationAction } from '@/lib/verification';

const schema = z.object({
  action: z.enum(['resolve', 'dismiss', 'suspend_user']),
  adminNotes: z.string().trim().max(4000).optional(),
  resolution: z.string().trim().max(1000).optional(),
});

export async function PATCH(request: NextRequest, context: RouteContext<'/api/admin/reports/[id]'>) {
  let actor;
  try {
    actor = await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Authentication required.' : 'Admin role required.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await context.params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (parsed.data.action === 'suspend_user' && !report.targetUserId) {
    return NextResponse.json({ error: 'This report does not target a user that can be suspended.' }, { status: 400 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const next = await tx.report.update({
      where: { id },
      data: {
        status: parsed.data.action === 'dismiss' ? 'DISMISSED' : 'RESOLVED',
        adminNotes: parsed.data.adminNotes ?? null,
        resolution: parsed.data.resolution ?? null,
        resolvedAt: new Date(),
        resolvedById: actor.id,
      },
    });
    if (parsed.data.action === 'suspend_user' && report.targetUserId) {
      await tx.user.update({
        where: { id: report.targetUserId },
        data: { suspendedAt: new Date(), suspendedReason: parsed.data.adminNotes ?? 'Suspended by admin moderation.' },
      });
      await logModerationAction({
        client: tx,
        actorId: actor.id,
        action: ModerationAuditAction.USER_SUSPENDED,
        entityType: 'User',
        entityId: report.targetUserId,
        after: { suspendedAt: new Date().toISOString(), reason: parsed.data.adminNotes ?? null },
        reason: parsed.data.adminNotes ?? 'Suspended following report review.',
      });
    }
    await tx.notification.createMany({
      data: report.reporterId ? [{
        userId: report.reporterId,
        type: 'MODERATION',
        message: `Your report has been ${parsed.data.action === 'resolve' ? 'resolved' : 'dismissed'}.`,
      }] : [],
    });
    await logModerationAction({
      client: tx,
      actorId: actor.id,
      action: ModerationAuditAction.REPORT_STATUS_CHANGED,
      entityType: 'Report',
      entityId: report.id,
      before: { status: report.status },
      after: { status: next.status, adminNotes: parsed.data.adminNotes ?? null, resolution: parsed.data.resolution ?? null },
      reason: parsed.data.adminNotes ?? 'Admin reviewed report.',
    });
    return next;
  });
  return NextResponse.json({ data: updated });
}
