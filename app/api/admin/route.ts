import { NextResponse } from 'next/server';
import { UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Authentication required.' : 'Admin role required.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const [users, properties, reports, payments] = await prisma.$transaction([
    prisma.user.findMany({ select: { id: true, name: true, email: true, role: true, createdAt: true }, orderBy: { createdAt: 'desc' } }),
    prisma.property.findMany({ include: { owner: { select: { name: true, email: true } }, location: true }, orderBy: { createdAt: 'desc' } }),
    prisma.report.findMany({ include: { property: true, user: { select: { name: true, email: true } } }, orderBy: { createdAt: 'desc' } }),
    prisma.payment.findMany({ include: { user: { select: { name: true, email: true } }, property: { select: { title: true } } }, orderBy: { createdAt: 'desc' } }),
  ]);
  return NextResponse.json({ data: { users, properties, reports, payments } });
}
