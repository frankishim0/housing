import { NextRequest, NextResponse } from 'next/server';
import { FinancialTransactionStatus, ListingType, PaymentType } from '@prisma/client';
import { getSessionUser } from '@/lib/auth';
import { isCurrencyCode, getCurrencyName } from '@/lib/international';
import { calculateCommission } from '@/lib/monetization';
import { prisma } from '@/lib/prisma';
import { z } from 'zod';

const schema = z.object({ propertyId: z.string().min(1) });

function getTransactionType(listingType: ListingType): PaymentType {
  if (listingType === ListingType.SALE) return PaymentType.SALE;
  if (listingType === ListingType.LEASE) return PaymentType.LEASE;
  if (listingType === ListingType.SHORT_TERM_RENT) return PaymentType.SHORT_TERM_RENT;
  return PaymentType.RENT;
}

export async function POST(request: NextRequest) {
  const user = await getSessionUser();
  if (!user) return NextResponse.json({ error: 'Authentication required.' }, { status: 401 });

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const property = await prisma.property.findUnique({
    where: { id: parsed.data.propertyId },
    include: { location: { select: { countryCode: true } }, owner: { select: { id: true } }, agent: { select: { id: true } } },
  });
  if (!property || property.status !== 'PUBLISHED') {
    return NextResponse.json({ error: 'Property is not available for a transaction quote.' }, { status: 404 });
  }
  if (property.ownerId === user.id || property.agentId === user.id) {
    return NextResponse.json({ error: 'You cannot request a transaction quote for your own listing.' }, { status: 400 });
  }
  if (!isCurrencyCode(property.currencyCode)) {
    return NextResponse.json({ error: 'The listing currency is not supported for transaction quotes.' }, { status: 422 });
  }

  const transactionType = getTransactionType(property.listingType);
  const countryCode = property.location.countryCode;
  const [currency, rules] = await Promise.all([
    prisma.currency.upsert({
      where: { code: property.currencyCode },
      create: { code: property.currencyCode, name: getCurrencyName(property.currencyCode) },
      update: {},
    }),
    prisma.commissionRule.findMany({
      where: {
        active: true,
        AND: [
          { OR: [{ transactionType: null }, { transactionType }] },
          { OR: [{ countryCode: null }, { countryCode }] },
          { OR: [{ propertyTypeCode: null }, { propertyTypeCode: property.type }] },
          { OR: [{ currencyCode: null }, { currencyCode: property.currencyCode }] },
        ],
      },
      orderBy: [{ updatedAt: 'desc' }, { id: 'asc' }],
    }),
  ]);

  const selectedRule = rules.sort((left, right) => {
    const specificity = (rule: typeof left) => [
      rule.transactionType,
      rule.countryCode,
      rule.propertyTypeCode,
      rule.currencyCode,
    ].filter(Boolean).length;
    return specificity(right) - specificity(left);
  })[0];
  const amounts = calculateCommission({
    amount: property.price.toString(),
    percentageRate: selectedRule?.percentageRate.toString() ?? '0',
    fixedFee: selectedRule?.fixedFee.toString() ?? '0',
    processingFeeRate: selectedRule?.processingFeeRate.toString() ?? '0',
    processingFeeFixed: selectedRule?.processingFeeFixed.toString() ?? '0',
    payer: selectedRule?.payer ?? 'SELLER',
    minorUnits: currency.minorUnits,
  });

  const quote = await prisma.financialTransaction.create({
    data: {
      reference: `FQ-${crypto.randomUUID()}`,
      buyerId: user.id,
      sellerId: property.ownerId,
      agentId: property.agent?.id,
      propertyId: property.id,
      commissionRuleId: selectedRule?.id,
      transactionType,
      status: FinancialTransactionStatus.QUOTED,
      currencyCode: property.currencyCode,
      countryCode,
      commissionPayer: selectedRule?.payer ?? 'SELLER',
      commissionRate: selectedRule?.percentageRate ?? 0,
      commissionFixedFee: selectedRule?.fixedFee ?? 0,
      platformCommission: amounts.platformCommission,
      buyerPlatformFee: amounts.buyerPlatformFee,
      sellerCommission: amounts.sellerCommission,
      processingFeeRate: selectedRule?.processingFeeRate ?? 0,
      processingFeeFixed: selectedRule?.processingFeeFixed ?? 0,
      paymentProcessingFee: amounts.paymentProcessingFee,
      amount: amounts.amount,
      totalBuyerDue: amounts.totalBuyerDue,
      sellerAmount: amounts.sellerAmount,
      finalPayout: amounts.finalPayout,
    },
    select: {
      id: true,
      reference: true,
      transactionType: true,
      status: true,
      amount: true,
      currencyCode: true,
      commissionRate: true,
      commissionFixedFee: true,
      platformCommission: true,
      buyerPlatformFee: true,
      paymentProcessingFee: true,
      totalBuyerDue: true,
      sellerAmount: true,
      finalPayout: true,
      commissionPayer: true,
      createdAt: true,
    },
  });

  return NextResponse.json({
    data: { ...quote, commissionRuleName: selectedRule?.name ?? null },
    paymentEnabled: false,
  }, { status: 201 });
}
