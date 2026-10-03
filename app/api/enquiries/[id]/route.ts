import { NextRequest, NextResponse } from 'next/server';
import { EnquiryStatus } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const statusSchema = z.object({ status: z.nativeEnum(EnquiryStatus) });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const enquiry = await prisma.enquiry.findUnique({ where: { id: (await params).id }, include: { property: true } });
  if (!enquiry) return NextResponse.json({ error: 'Enquiry not found.' }, { status: 404 });
  if (user.id !== enquiry.userId && user.id !== enquiry.property.ownerId && user.id !== enquiry.property.agentId) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  const parsed = statusSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const updated = await prisma.enquiry.update({ where: { id: enquiry.id }, data: { status: parsed.data.status } });
  return NextResponse.json({ data: updated });
}
