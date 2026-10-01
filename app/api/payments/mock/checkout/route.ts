import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/auth';
import { isLocalMockPaymentsEnabled } from '@/lib/payments';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  if (!isLocalMockPaymentsEnabled()) {
    return NextResponse.json({ error: 'Local mock payments are disabled.' }, { status: 404 });
  }
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const reference = request.nextUrl.searchParams.get('reference');
  if (!reference || reference.length > 100) {
    return NextResponse.json({ error: 'A valid payment reference is required.' }, { status: 400 });
  }
  const payment = await prisma.payment.findUnique({
    where: { reference },
    include: {
      currencyData: { select: { minorUnits: true } },
      financialTransaction: true,
    },
  });
  if (!payment || payment.userId !== user.id || payment.provider !== 'MOCK'
    || payment.providerReference !== reference) {
    return NextResponse.json({ error: 'Local mock payment not found.' }, { status: 404 });
  }

  const financialTransaction = payment.financialTransaction;
  let purchaseName = financialTransaction ? 'Property transaction' : 'Marketplace order';
  if (reference.startsWith('SUB-')) {
    const subscription = await prisma.userSubscription.findUnique({
      where: { id: reference.slice('SUB-'.length) },
      include: { product: { select: { name: true } } },
    });
    if (subscription?.userId === user.id) purchaseName = subscription.product.name;
  } else if (reference.startsWith('FEATURED-')) {
    const listing = await prisma.featuredListing.findUnique({
      where: { id: reference.slice('FEATURED-'.length) },
      include: { property: { select: { title: true } } },
    });
    if (listing?.purchaserId === user.id) purchaseName = `Featured listing: ${listing.property.title}`;
  }

  return NextResponse.json({
    data: {
      reference: payment.reference,
      amount: payment.amount.toString(),
      currency: payment.currency,
      minorUnits: payment.currencyData.minorUnits,
      status: payment.status,
      purchaseName,
      transaction: financialTransaction ? {
        status: financialTransaction.status,
        amount: financialTransaction.amount.toString(),
        platformCommission: financialTransaction.platformCommission.toString(),
        buyerPlatformFee: financialTransaction.buyerPlatformFee.toString(),
        totalBuyerDue: financialTransaction.totalBuyerDue.toString(),
        sellerAmount: financialTransaction.sellerAmount.toString(),
        finalPayout: financialTransaction.finalPayout.toString(),
        commissionRate: financialTransaction.commissionRate.toString(),
        commissionPayer: financialTransaction.commissionPayer,
        currencyCode: financialTransaction.currencyCode,
        transactionType: financialTransaction.transactionType,
      } : null,
    },
  });
}
