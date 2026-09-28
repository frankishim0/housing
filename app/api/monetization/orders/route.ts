import { MonetizationProductType, UserRole } from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ productId: z.string().min(1), propertyId: z.string().optional() });
const professionalRoles: UserRole[] = [UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER];

export async function GET() {
  const products = await prisma.monetizationProduct.findMany({
    where: { active: true },
    select: { id: true, code: true, name: true, description: true, type: true, billingInterval: true, price: true, currencyCode: true, durationDays: true, listingLimit: true, features: true },
    orderBy: [{ type: 'asc' }, { name: 'asc' }],
  });
  return NextResponse.json({ data: products, paymentEnabled: false });
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!professionalRoles.includes(user.role)) return NextResponse.json({ error: 'A property professional account is required.' }, { status: 403 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  const product = await prisma.monetizationProduct.findFirst({ where: { id: parsed.data.productId, active: true } });
  if (!product) return NextResponse.json({ error: 'Monetization product not found or inactive.' }, { status: 404 });
  if (product.type === MonetizationProductType.QUALIFIED_LEAD) {
    return NextResponse.json({ error: 'Paid lead orders are unavailable until a consented, qualified lead distribution workflow is configured.' }, { status: 409 });
  }

  if (product.type === MonetizationProductType.SUBSCRIPTION) {
    const active = await prisma.userSubscription.findFirst({
      where: { userId: user.id, status: 'ACTIVE', currentPeriodEnd: { gt: new Date() } },
      select: { id: true },
    });
    if (active) return NextResponse.json({ error: 'An active subscription already exists. Contact support to change plans.' }, { status: 409 });
    const existing = await prisma.userSubscription.findFirst({
      where: { userId: user.id, productId: product.id, status: 'PENDING' },
      select: { id: true },
    });
    if (existing) return NextResponse.json({ data: existing, paymentEnabled: false }, { status: 200 });
    const order = await prisma.userSubscription.create({
      data: {
        userId: user.id,
        productId: product.id,
        billingInterval: product.billingInterval,
        priceAtPurchase: product.price,
        currencyCode: product.currencyCode,
      },
      select: { id: true, status: true, priceAtPurchase: true, currencyCode: true, billingInterval: true, createdAt: true },
    });
    return NextResponse.json({ data: order, paymentEnabled: false }, { status: 201 });
  }

  if (!parsed.data.propertyId) return NextResponse.json({ error: 'Choose a property to promote.' }, { status: 400 });
  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    select: { id: true, ownerId: true, agentId: true, status: true },
  });
  if (!property || property.status !== 'PUBLISHED') return NextResponse.json({ error: 'Only published properties can be promoted.' }, { status: 404 });
  if (property.ownerId !== user.id && property.agentId !== user.id) return NextResponse.json({ error: 'You can only promote a property you own or manage.' }, { status: 403 });

  const existing = await prisma.featuredListing.findFirst({
    where: { propertyId: property.id, productId: product.id, purchaserId: user.id, status: 'PENDING' },
    select: { id: true },
  });
  if (existing) return NextResponse.json({ data: existing, paymentEnabled: false }, { status: 200 });
  const order = await prisma.featuredListing.create({
    data: {
      propertyId: property.id,
      purchaserId: user.id,
      productId: product.id,
      priceAtPurchase: product.price,
      currencyCode: product.currencyCode,
    },
    select: { id: true, status: true, priceAtPurchase: true, currencyCode: true, createdAt: true },
  });
  return NextResponse.json({ data: order, paymentEnabled: false }, { status: 201 });
}
