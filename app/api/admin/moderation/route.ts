import { NextRequest, NextResponse } from 'next/server';
import { UserRole, VerificationStatus } from '@prisma/client';
import { z } from 'zod';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const querySchema = z.object({
  status: z.enum(['PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED']).optional(),
  type: z.string().optional(),
});

export async function GET(request: NextRequest) {
  try {
    await requireRole([UserRole.ADMIN]);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 'Authentication required.' : 'Admin role required.' }, { status: error instanceof Error && error.message === 'UNAUTHENTICATED' ? 401 : 403 });
  }
  const parsedQuery = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams.entries()));
  if (!parsedQuery.success) return NextResponse.json({ error: parsedQuery.error.flatten() }, { status: 400 });
  const query = parsedQuery.data;
  const [verifications, reports, users] = await prisma.$transaction([
    prisma.verification.findMany({
      where: {
        ...(query.status ? { status: query.status as VerificationStatus } : {}),
        ...(query.type ? { type: query.type } : {}),
      },
      include: { property: { select: { id: true, title: true, slug: true, verified: true, verifiedAt: true } }, user: { select: { id: true, name: true, email: true, role: true, verificationStatus: true } }, reviewer: { select: { id: true, name: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.report.findMany({
      include: {
        property: { select: { id: true, title: true, slug: true } },
        reporter: { select: { id: true, name: true, email: true } },
        targetUser: { select: { id: true, name: true, email: true, role: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    }),
    prisma.user.findMany({
      where: { verificationStatus: { in: [VerificationStatus.VERIFIED, VerificationStatus.PENDING, VerificationStatus.REJECTED] } },
      select: { id: true, name: true, email: true, role: true, verificationStatus: true, verificationReviewedAt: true },
      orderBy: { updatedAt: 'desc' },
      take: 200,
    }),
  ]);
  return NextResponse.json({
    data: {
      verifications: verifications.map((verification) => ({
        ...verification,
        documents: undefined,
        documentUrl: undefined,
        documentCount: Array.isArray(verification.documents) ? verification.documents.length : 0,
      })),
      reports,
      users,
    },
  });
}
