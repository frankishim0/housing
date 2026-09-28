import { NextRequest, NextResponse } from 'next/server';
import { UserVerificationStatus, UserRole } from '@prisma/client';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ status: z.nativeEnum(UserVerificationStatus) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requireRole([UserRole.ADMIN]);
  } catch (error) {
    const unauthenticated = error instanceof Error && error.message === 'UNAUTHENTICATED';
    return NextResponse.json({ error: unauthenticated ? 'Authentication required.' : 'Admin role required.' }, { status: unauthenticated ? 401 : 403 });
  }
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const { id } = await params;
  const user = await prisma.user.update({
    where: { id },
    data: { verificationStatus: parsed.data.status },
    select: { id: true, name: true, role: true, verificationStatus: true },
  }).catch(() => null);
  if (!user) return NextResponse.json({ error: 'User not found.' }, { status: 404 });
  return NextResponse.json({ data: user });
}