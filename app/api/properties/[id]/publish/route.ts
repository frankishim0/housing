import { NextRequest, NextResponse } from 'next/server';
import { PropertyStatus } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const property = await prisma.property.findUnique({ where: { id: (await params).id } });
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  if (user.role !== 'ADMIN' && property.ownerId !== user.id && property.agentId !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }

  const { published } = await request.json();
  const updated = await prisma.property.update({
    where: { id: property.id },
    data: {
      status: published ? PropertyStatus.PUBLISHED : PropertyStatus.PAUSED,
      publishedAt: published ? new Date() : null,
    },
  });
  return NextResponse.json({ data: updated });
}
