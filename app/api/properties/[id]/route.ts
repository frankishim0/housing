import { NextRequest, NextResponse } from 'next/server';
import { Prisma, PropertyStatus, UserRole } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

function serialized<T extends { price: Prisma.Decimal | unknown }>(property: T) {
  return { ...property, price: Number(property.price) };
}

async function findProperty(id: string) {
  return prisma.property.findFirst({
    where: { OR: [{ id }, { slug: id }] },
    include: { location: true, media: { orderBy: { order: 'asc' } }, amenities: true, owner: true, agent: true },
  });
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const property = await findProperty((await params).id);
  if (!property || property.status === PropertyStatus.DRAFT || property.status === PropertyStatus.SUSPENDED) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }
  return NextResponse.json({ data: serialized(property) });
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user || !([UserRole.OWNER, UserRole.AGENT, UserRole.ADMIN] as UserRole[]).includes(user.role)) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: user ? 403 : 401 });
  }

  const property = await findProperty((await params).id);
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  if (user.role !== UserRole.ADMIN && property.ownerId !== user.id && property.agentId !== user.id) {
    return NextResponse.json({ error: 'You do not own this property.' }, { status: 403 });
  }

  const body = await request.json();
  const data: Prisma.PropertyUpdateInput = {};
  for (const field of ['title', 'description', 'type', 'price', 'bedrooms', 'bathrooms', 'size'] as const) {
    if (body[field] !== undefined) data[field] = field === 'title' || field === 'description' || field === 'type' ? String(body[field]) : Number(body[field]);
  }
  if (body.status) data.status = body.status as PropertyStatus;
  const updated = await prisma.property.update({ where: { id: property.id }, data, include: { location: true, media: true, amenities: true } });
  return NextResponse.json({ data: serialized(updated) });
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const property = await findProperty((await params).id);
  if (!property) return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  if (user.role !== UserRole.ADMIN && property.ownerId !== user.id && property.agentId !== user.id) {
    return NextResponse.json({ error: 'Forbidden.' }, { status: 403 });
  }
  await prisma.property.delete({ where: { id: property.id } });
  return NextResponse.json({ success: true });
}
