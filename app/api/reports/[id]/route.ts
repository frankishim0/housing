import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET(_request: NextRequest, context: RouteContext<'/api/reports/[id]'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const { id } = await context.params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: 'Report not found.' }, { status: 404 });
  if (report.reporterId !== user.id && user.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  return NextResponse.json({ data: report });
}
