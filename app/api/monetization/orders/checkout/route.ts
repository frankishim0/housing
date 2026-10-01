import {
  BillingInterval,
  FinancialAuditAction,
  MonetizationProductType,
  MonetizationOrderStatus,
  PaymentStatus,
  PaymentType,
  Prisma,
  SubscriptionStatus,
  UserRole,
} from '@prisma/client';
import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { amountToMinorUnits, assertTestPaymentProviderConfiguration, getApplicationUrl, getPaymentProvider, UnsupportedPaymentProviderError } from '@/lib/payments';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({
  orderType: z.enum(['SUBSCRIPTION', 'FEATURED_LISTING']),
  orderId: z.string().min(1),
}).strict();
const professionalRoles: UserRole[] = [UserRole.OWNER, UserRole.LANDLORD, UserRole.AGENT, UserRole.PROPERTY_MANAGER, UserRole.DEVELOPER];

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  if (!professionalRoles.includes(user.role)) return NextResponse.json({ error: 'A property professional account is required.' }, { status: 403 });
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const { orderType, orderId } = parsed.data;
    const subscription = orderType === 'SUBSCRIPTION'
      ? await prisma.userSubscription.findUnique({ where: { id: orderId }, include: { product: true } })
      : null;
    const featuredListing = orderType === 'FEATURED_LISTING'
      ? await prisma.featuredListing.findUnique({ where: { id: orderId }, include: { product: true, property: { select: { title: true } } } })
      : null;

    const authorizedSubscription = subscription?.userId === user.id && subscription.status === SubscriptionStatus.PENDING
      && subscription.product.type === MonetizationProductType.SUBSCRIPTION;
    const authorizedFeatured = featuredListing?.purchaserId === user.id && featuredListing.status === MonetizationOrderStatus.PENDING
      && featuredListing.product.type === MonetizationProductType.FEATURED_LISTING;
    if (!authorizedSubscription && !authorizedFeatured) {
      return NextResponse.json({ error: 'Pending monetization order not found.' }, { status: 404 });
    }

    const isSubscription = Boolean(authorizedSubscription);
    const purchaseReference = isSubscription ? subscription!.id : featuredListing!.id;
    const currencyCode = isSubscription ? subscription!.currencyCode : featuredListing!.currencyCode;
    const amount = isSubscription ? subscription!.priceAtPurchase : featuredListing!.priceAtPurchase;
    const billingInterval = isSubscription ? subscription!.billingInterval : BillingInterval.ONE_TIME;
    const provider = getPaymentProvider(currencyCode);
    assertTestPaymentProviderConfiguration(provider.code);
    const appUrl = getApplicationUrl();
    if (isSubscription && billingInterval !== BillingInterval.MONTHLY && billingInterval !== BillingInterval.ANNUAL) {
      return NextResponse.json({ error: 'Paid subscription plans must use a monthly or annual billing interval.' }, { status: 409 });
    }
    if (amount.lte(0)) return NextResponse.json({ error: 'Test Checkout requires a positive product price.' }, { status: 409 });
    const currency = await prisma.currency.findUnique({ where: { code: currencyCode }, select: { minorUnits: true } });
    if (!currency) return NextResponse.json({ error: 'The product currency is not configured.' }, { status: 422 });
    const amountMinor = amountToMinorUnits(amount.toString(), currency.minorUnits);
    const paymentReference = `${isSubscription ? 'SUB' : 'FEATURED'}-${purchaseReference}`;
    const propertyId = isSubscription ? null : featuredListing!.propertyId;
    const payment = await prisma.$transaction(async (tx) => {
      const existingPayment = await tx.payment.findUnique({ where: { reference: paymentReference } });
      if (existingPayment) return existingPayment;
      const created = await tx.payment.create({
        data: {
          userId: user.id,
          propertyId,
          amount,
          currency: currencyCode,
          provider: provider.code,
          reference: paymentReference,
          status: PaymentStatus.PENDING,
          paymentType: PaymentType.PLATFORM_FEE,
        },
      });
      await tx.financialAuditLog.create({
        data: {
          actorId: user.id,
          action: FinancialAuditAction.FINANCIAL_STATUS_CHANGED,
          entityType: orderType === 'SUBSCRIPTION' ? 'UserSubscription' : 'FeaturedListing',
          entityId: purchaseReference,
          after: { status: 'PENDING_PAYMENT', provider: provider.code, mode: 'test', paymentId: created.id },
          reason: `User initiated a ${provider.code} test-mode payment.`,
        },
      });
      return created;
    });
    if (payment.provider !== provider.code || payment.status !== PaymentStatus.PENDING) {
      return NextResponse.json({ error: 'This order already has a final payment status.' }, { status: 409 });
    }

    if (payment.providerReference) {
      return NextResponse.json({ error: 'A payment was already initialized for this order. Create a new order to start another payment.' }, { status: 409 });
    }

    const claimed = await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING, providerReference: null },
      data: { providerReference: payment.reference },
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ error: 'This payment is already being initialized. Refresh the order before retrying.' }, { status: 409 });
    }
    const initialized = await provider.initialize({
      amountMinor,
      currency: currencyCode,
      email: user.email,
      reference: payment.reference,
      callbackUrl: `${appUrl}/api/payments/verify?reference=${encodeURIComponent(payment.reference)}`,
      purchaseType: isSubscription ? 'SUBSCRIPTION' : 'FEATURED_LISTING',
    });
    if (initialized.reference !== payment.reference) {
      throw new Error('Paystack returned a reference different from the server payment reference.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.financialAuditLog.create({
        data: {
          actorId: user.id,
          action: FinancialAuditAction.FINANCIAL_STATUS_CHANGED,
          entityType: orderType === 'SUBSCRIPTION' ? 'UserSubscription' : 'FeaturedListing',
          entityId: purchaseReference,
          after: { paymentReference: initialized.reference, provider: provider.code, mode: 'test' },
          reason: `${provider.code} test-mode payment was initialized.`,
        },
      });
    });
    return NextResponse.json({ data: { authorizationUrl: initialized.authorizationUrl, provider: provider.code, testMode: true } }, { status: 201 });
  } catch (error) {
    if (error instanceof UnsupportedPaymentProviderError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'A payment attempt for this order already exists. Refresh the order and retry.' }, { status: 409 });
    }
    console.error('Test monetization payment initialization failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Test-mode payment is unavailable. Check the selected provider configuration, currency support, and APP_URL.' }, { status: 503 });
  }
}
