import { FinancialTransactionStatus, ListingType, PaymentStatus, PaymentType, Prisma } from '@prisma/client';
import { NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { amountToMinorUnits, assertTestPaymentProviderConfiguration, getApplicationUrl, getPaymentProvider, parseCheckoutBody, UnsupportedPaymentProviderError } from '@/lib/payments';
import { prisma } from '@/lib/prisma';
import { canStartSaleCheckout } from '@/lib/transaction-lifecycle';

function paymentTypeForListing(listingType: ListingType): PaymentType {
  if (listingType === ListingType.SALE) return PaymentType.SALE;
  if (listingType === ListingType.LEASE) return PaymentType.LEASE;
  if (listingType === ListingType.SHORT_TERM_RENT) return PaymentType.SHORT_TERM_RENT;
  return PaymentType.RENT;
}

export async function POST(request: Request, context: RouteContext<'/api/transactions/[id]/checkout'>) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });
  const parsedBody = parseCheckoutBody(await request.text());
  if (!parsedBody.success) return NextResponse.json({ error: 'Checkout accepts no client-supplied price or financial values.' }, { status: 400 });
  const { id } = await context.params;

  try {
    let transaction = await prisma.financialTransaction.findUnique({
      where: { id },
      include: { property: { select: { title: true, price: true, currencyCode: true, status: true, ownerId: true, agentId: true, listingType: true } }, currency: { select: { minorUnits: true } }, payment: true },
    });
    if (!transaction || transaction.buyerId !== user.id) {
      return NextResponse.json({ error: 'Transaction quote not found.' }, { status: 404 });
    }
    if (!transaction.property || (transaction.property.status !== 'PUBLISHED'
      || transaction.property.currencyCode !== transaction.currencyCode
      || !new Prisma.Decimal(transaction.property.price).equals(transaction.amount)
      || transaction.property.ownerId !== transaction.sellerId
      || transaction.property.agentId !== transaction.agentId
      || paymentTypeForListing(transaction.property.listingType) !== transaction.transactionType)) {
      return NextResponse.json({ error: 'The listing price or availability changed. Request a new transaction quote.' }, { status: 409 });
    }
    const provider = getPaymentProvider(transaction.currencyCode, transaction.countryCode);
    assertTestPaymentProviderConfiguration(provider.code);
    const appUrl = getApplicationUrl();

    if (transaction.status === FinancialTransactionStatus.QUOTED) {
      amountToMinorUnits(transaction.totalBuyerDue.toString(), transaction.currency.minorUnits);
      const propertyTransactionTypes = new Set<PaymentType>([PaymentType.SALE, PaymentType.RENT, PaymentType.LEASE, PaymentType.SHORT_TERM_RENT]);
      const paymentType = propertyTransactionTypes.has(transaction.transactionType)
        ? transaction.transactionType
        : PaymentType.PLATFORM_FEE;
      transaction = await prisma.$transaction(async (tx) => {
        if (transaction!.propertyId) {
          await tx.$queryRaw`SELECT "id" FROM "Property" WHERE "id" = ${transaction!.propertyId} FOR UPDATE`;
          const currentProperty = await tx.property.findUnique({
            where: { id: transaction!.propertyId },
            select: { status: true, price: true, currencyCode: true, ownerId: true, agentId: true, listingType: true },
          });
          if (!currentProperty || currentProperty.status !== 'PUBLISHED'
            || currentProperty.currencyCode !== transaction!.currencyCode
            || !new Prisma.Decimal(currentProperty.price).equals(transaction!.amount)
            || currentProperty.ownerId !== transaction!.sellerId
            || currentProperty.agentId !== transaction!.agentId
            || paymentTypeForListing(currentProperty.listingType) !== transaction!.transactionType) {
            throw new Error('LISTING_CHANGED_BEFORE_CHECKOUT');
          }
          if (transaction!.transactionType === PaymentType.SALE) {
            const competingSale = await tx.financialTransaction.findFirst({
              where: {
                propertyId: transaction!.propertyId,
                id: { not: transaction!.id },
                transactionType: PaymentType.SALE,
                status: { in: [FinancialTransactionStatus.PENDING_PAYMENT, FinancialTransactionStatus.PAID, FinancialTransactionStatus.DISPUTED] },
              },
              select: { status: true },
            });
            if (!canStartSaleCheckout(transaction!.transactionType, currentProperty.status, competingSale?.status ?? null)) {
              throw new Error('SALE_ALREADY_IN_PROGRESS');
            }
          }
        } else {
          throw new Error('LISTING_CHANGED_BEFORE_CHECKOUT');
        }

        const payment = await tx.payment.create({
          data: {
            userId: user.id,
            propertyId: transaction!.propertyId,
            amount: transaction!.totalBuyerDue,
            currency: transaction!.currencyCode,
            provider: provider.code,
            reference: transaction!.reference,
            status: PaymentStatus.PENDING,
            paymentType,
          },
        });
        const claimed = await tx.financialTransaction.updateMany({
          where: { id: transaction!.id, buyerId: user.id, status: FinancialTransactionStatus.QUOTED },
          data: { status: FinancialTransactionStatus.PENDING_PAYMENT, paymentId: payment.id },
        });
        if (claimed.count !== 1) throw new Error('QUOTE_ALREADY_CHECKED_OUT');
        await tx.financialAuditLog.create({
          data: {
            actorId: user.id,
            action: 'FINANCIAL_STATUS_CHANGED',
            entityType: 'FinancialTransaction',
            entityId: transaction!.id,
            before: { status: FinancialTransactionStatus.QUOTED },
            after: { status: FinancialTransactionStatus.PENDING_PAYMENT, provider: provider.code, mode: 'test', paymentId: payment.id },
            reason: `Buyer initiated a ${provider.code} test-mode payment.`,
          },
        });
        return tx.financialTransaction.findUniqueOrThrow({
          where: { id: transaction!.id },
          include: { property: { select: { title: true, price: true, currencyCode: true, status: true, ownerId: true, agentId: true, listingType: true } }, currency: { select: { minorUnits: true } }, payment: true },
        });
      });
    } else if (transaction.status !== FinancialTransactionStatus.PENDING_PAYMENT || !transaction.payment) {
      return NextResponse.json({ error: `This quote cannot be checked out while it is ${transaction.status.toLowerCase()}.` }, { status: 409 });
    }

    const payment = transaction.payment;
    if (!payment || payment.provider !== provider.code || payment.status !== PaymentStatus.PENDING) {
      return NextResponse.json({ error: 'There is no pending test payment for this quote.' }, { status: 409 });
    }
    if (payment.providerReference) {
      return NextResponse.json({ error: 'A payment was already initialized for this quote. Request a fresh quote to start another payment.' }, { status: 409 });
    }

    const claimed = await prisma.payment.updateMany({
      where: { id: payment.id, status: PaymentStatus.PENDING, providerReference: null },
      data: { providerReference: payment.reference },
    });
    if (claimed.count !== 1) {
      return NextResponse.json({ error: 'This payment is already being initialized. Refresh the quote before retrying.' }, { status: 409 });
    }
    let initialized;
    try {
      initialized = await provider.initialize({
        amountMinor: amountToMinorUnits(payment.amount.toString(), transaction.currency.minorUnits),
        currency: transaction.currencyCode,
        email: user.email,
        reference: payment.reference,
        callbackUrl: `${appUrl}/api/payments/verify?reference=${encodeURIComponent(payment.reference)}`,
        purchaseType: 'TRANSACTION',
      });
    } catch (error) {
      await prisma.payment.updateMany({
        where: { id: payment.id, status: PaymentStatus.PENDING, providerReference: payment.reference },
        data: { providerReference: null },
      });
      throw error;
    }
    if (initialized.reference !== payment.reference) {
      throw new Error('Paystack returned a reference different from the server payment reference.');
    }
    await prisma.$transaction(async (tx) => {
      await tx.financialAuditLog.create({
        data: {
          actorId: user.id,
          action: 'FINANCIAL_STATUS_CHANGED',
          entityType: 'FinancialTransaction',
          entityId: transaction!.id,
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
    if (error instanceof Error && error.message === 'QUOTE_ALREADY_CHECKED_OUT') {
      return NextResponse.json({ error: 'This quote is already being checked out. Refresh and try again.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'LISTING_CHANGED_BEFORE_CHECKOUT') {
      return NextResponse.json({ error: 'The listing is no longer available at the quoted price. Request a new transaction quote.' }, { status: 409 });
    }
    if (error instanceof Error && error.message === 'SALE_ALREADY_IN_PROGRESS') {
      return NextResponse.json({ error: 'Another buyer already has an active or completed purchase for this sale listing.' }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return NextResponse.json({ error: 'This quote already has a payment attempt. Refresh and continue its payment flow.' }, { status: 409 });
    }
    console.error('Test payment initialization failed:', error instanceof Error ? error.message : 'Unknown error');
    return NextResponse.json({ error: 'Test-mode payment is unavailable. Check the selected provider configuration, currency support, and APP_URL.' }, { status: 503 });
  }
}
