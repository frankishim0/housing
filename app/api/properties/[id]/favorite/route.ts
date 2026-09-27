import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function POST(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const propertyId = (await params).id;
  const property = await prisma.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });

  const existing = await prisma.favorite.findUnique({ where: { userId_propertyId: { userId: user.id, propertyId } } });
  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ favorite: false });
  }

  await prisma.favorite.create({ data: { userId: user.id, propertyId } });
  return NextResponse.json({ favorite: true });
}

export async function GET(_: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ favorite: false });
  const favorite = await prisma.favorite.findUnique({ where: { userId_propertyId: { userId: user.id, propertyId: (await params).id } } });
  return NextResponse.json({ favorite: Boolean(favorite) });
}
